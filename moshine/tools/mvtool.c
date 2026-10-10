// mvtool.c — the fidelity bench's reference decoder (dev only, native libavcodec; spec §12.5, decision D30).
//
//   mvtool <in> <out.rgb> [--mvs out.jsonl] [--drop-keys-after N] [--dup INDEX:COUNT ...] [--no-showall]
//
// Decodes the first video stream packet by packet, in file order (the bench encodes without B-frames, so file
// order is display order). Before decoding it can operate on the bitstream exactly like classic moshing tools:
//   --drop-keys-after N   drop every key packet whose index is > N (the I-frame drop)
//   --dup I:C             feed packet I another C times (P-frame duplication, "bloom")
// Writes every decoded frame as packed rgb24 to <out.rgb>, and with --mvs one JSON line per frame:
//   {"i":0,"pkt":0,"type":"P","mvs":[[w,h,dst_x,dst_y,motion_x,motion_y,motion_scale,source], ...]}
// (FFmpeg convention: src = dst + motion / motion_scale; blocks without a vector are intra coded.)
//
// Build: sh moshine/tools/build-mvtool.sh
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/motion_vector.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int dupIdx[64], dupCnt[64], nDup = 0;

static int emit(AVCodecContext *dec, AVFrame *fr, struct SwsContext **sws, FILE *out, FILE *mvs, int *nOut, int pkt) {
  int w = fr->width, h = fr->height;
  if (!*sws) *sws = sws_getContext(w, h, fr->format, w, h, AV_PIX_FMT_RGB24, SWS_BILINEAR | SWS_ACCURATE_RND | SWS_FULL_CHR_H_INT, NULL, NULL, NULL);
  uint8_t *rgb = malloc((size_t)w * h * 3); uint8_t *dst[1] = { rgb }; int ls[1] = { w * 3 };
  sws_scale(*sws, (const uint8_t *const *)fr->data, fr->linesize, 0, h, dst, ls);
  fwrite(rgb, 1, (size_t)w * h * 3, out); free(rgb);
  if (mvs) {
    char t = av_get_picture_type_char(fr->pict_type);
    fprintf(mvs, "{\"i\":%d,\"pkt\":%d,\"type\":\"%c\",\"w\":%d,\"h\":%d,\"mvs\":[", *nOut, pkt, t, w, h);
    AVFrameSideData *sd = av_frame_get_side_data(fr, AV_FRAME_DATA_MOTION_VECTORS);
    if (sd) {
      const AVMotionVector *mv = (const AVMotionVector *)sd->data; int n = sd->size / sizeof(*mv);
      for (int i = 0; i < n; i++)
        fprintf(mvs, "%s[%d,%d,%d,%d,%d,%d,%d,%d]", i ? "," : "", mv[i].w, mv[i].h, mv[i].dst_x, mv[i].dst_y, mv[i].motion_x, mv[i].motion_y, mv[i].motion_scale, mv[i].source);
    }
    fprintf(mvs, "]}\n");
  }
  (*nOut)++;
  return 0;
}

static int drain(AVCodecContext *dec, AVFrame *fr, struct SwsContext **sws, FILE *out, FILE *mvs, int *nOut, int pkt) {
  int r;
  while ((r = avcodec_receive_frame(dec, fr)) >= 0) { emit(dec, fr, sws, out, mvs, nOut, pkt); av_frame_unref(fr); }
  return r == AVERROR(EAGAIN) || r == AVERROR_EOF ? 0 : r;
}

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: mvtool <in> <out.rgb> [--mvs f] [--drop-keys-after N] [--dup I:C] [--no-showall]\n"); return 2; }
  const char *in = argv[1], *outp = argv[2], *mvp = NULL; int dropAfter = -1, showall = 1;
  for (int a = 3; a < argc; a++) {
    if (!strcmp(argv[a], "--mvs") && a + 1 < argc) mvp = argv[++a];
    else if (!strcmp(argv[a], "--drop-keys-after") && a + 1 < argc) dropAfter = atoi(argv[++a]);
    else if (!strcmp(argv[a], "--dup") && a + 1 < argc && nDup < 64) { if (sscanf(argv[++a], "%d:%d", &dupIdx[nDup], &dupCnt[nDup]) == 2) nDup++; }
    else if (!strcmp(argv[a], "--no-showall")) showall = 0;
    else { fprintf(stderr, "unknown argument %s\n", argv[a]); return 2; }
  }
  AVFormatContext *fmt = NULL;
  if (avformat_open_input(&fmt, in, NULL, NULL) < 0 || avformat_find_stream_info(fmt, NULL) < 0) { fprintf(stderr, "cannot open %s\n", in); return 1; }
  int si = av_find_best_stream(fmt, AVMEDIA_TYPE_VIDEO, -1, -1, NULL, 0);
  if (si < 0) { fprintf(stderr, "no video stream\n"); return 1; }
  const AVCodec *codec = avcodec_find_decoder(fmt->streams[si]->codecpar->codec_id);
  AVCodecContext *dec = avcodec_alloc_context3(codec);
  avcodec_parameters_to_context(dec, fmt->streams[si]->codecpar);
  dec->flags2 |= AV_CODEC_FLAG2_EXPORT_MVS;
  if (showall) dec->flags2 |= AV_CODEC_FLAG2_SHOW_ALL;     // output frames even when their reference is "missing" (that is the mosh)
  dec->thread_count = 1;                                    // deterministic, packet-by-packet
  if (avcodec_open2(dec, codec, NULL) < 0) { fprintf(stderr, "cannot open decoder\n"); return 1; }
  FILE *out = fopen(outp, "wb"), *mvs = mvp ? fopen(mvp, "w") : NULL;
  AVPacket *pkt = av_packet_alloc(); AVFrame *fr = av_frame_alloc(); struct SwsContext *sws = NULL;
  int idx = 0, nOut = 0, dropped = 0, duped = 0;
  while (av_read_frame(fmt, pkt) >= 0) {
    if (pkt->stream_index != si) { av_packet_unref(pkt); continue; }
    int key = (pkt->flags & AV_PKT_FLAG_KEY) != 0;
    if (dropAfter >= 0 && key && idx > dropAfter) { dropped++; idx++; av_packet_unref(pkt); continue; }
    int reps = 1; for (int d = 0; d < nDup; d++) if (dupIdx[d] == idx) reps += dupCnt[d];
    for (int r = 0; r < reps; r++) {
      AVPacket *p = av_packet_clone(pkt); if (r > 0) { p->pts = p->dts = AV_NOPTS_VALUE; duped++; }
      if (avcodec_send_packet(dec, p) < 0) fprintf(stderr, "decode error at packet %d\n", idx);
      av_packet_free(&p);
      drain(dec, fr, &sws, out, mvs, &nOut, idx);
    }
    idx++; av_packet_unref(pkt);
  }
  avcodec_send_packet(dec, NULL); drain(dec, fr, &sws, out, mvs, &nOut, idx);
  fprintf(stderr, "mvtool: %d packets, %d frames out, %d keys dropped, %d duplicates\n", idx, nOut, dropped, duped);
  fclose(out); if (mvs) fclose(mvs);
  sws_freeContext(sws); av_frame_free(&fr); av_packet_free(&pkt); avcodec_free_context(&dec); avformat_close_input(&fmt);
  return 0;
}
