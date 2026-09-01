#!/usr/bin/env python3
"""Produce the web build of the plague doctor mask.

assets/plague_doctor.glb is the authoring export: iori's own mesh, but 32 MB,
almost all of it 4K PNG texture maps. Three of those maps are still byte-for-byte
the CC-BY-ND asset the model was originally blocked out over. CC-BY-ND forbids
distributing a MODIFIED version, which rules out the one thing that would make
them shippable — downscaling. So they are dropped rather than shrunk, and the
web build carries only iori's own maps, resized and re-encoded.

Run:  python3 tools/build_mask_glb.py
Out:  assets/plague_doctor_web.glb
"""
import hashlib, json, os, shutil, struct, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "plague_doctor.glb")
DST = os.path.join(ROOT, "assets", "plague_doctor_web.glb")
ND_DIR = os.path.join(ROOT, "assets", "fantasy_plague_doctor_mask", "textures")
MAX_TEX = 1024
JPEG_Q = 4          # ffmpeg -q:v, 2 = best, 31 = worst.
                    # Full chroma is what protects the data maps; a higher
                    # quality floor on top of that just doubles the file.

JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942


def read_glb(path):
    with open(path, "rb") as f:
        magic, _ver, total = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            sys.exit("not a glb")
        js, blob = None, b""
        while f.tell() < total:
            ln, ty = struct.unpack("<II", f.read(8))
            data = f.read(ln)
            if ty == JSON_CHUNK:
                js = json.loads(data)
            elif ty == BIN_CHUNK:
                blob = data
        return js, blob


def write_glb(path, js, blob):
    j = json.dumps(js, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    blob += b"\0" * (-len(blob) % 4)
    total = 12 + 8 + len(j) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<II", len(j), JSON_CHUNK)); f.write(j)
        f.write(struct.pack("<II", len(blob), BIN_CHUNK)); f.write(blob)


# sha256 of every texture in the CC-BY-ND asset the model was blocked out over.
# Recorded here rather than read from the folder so this stays correct once that
# folder is deleted — otherwise removing it would silently start shipping them.
ND_TEXTURE_SHA256 = {
    "ff8919b86aa9517656cf3e63ede5162235393a9ea12610f4f08d827e738c9ed2",  # UV_2_baseColor
    "9959974e7f2033a81804b108450067ca06fac8c450e69368a76e9d4139c32f8c",  # UV_2_metallicRoughness
    "539e73785cbd234fa15b1b5b70f9e61c3fe528a48e268f056f5a0300531fc2d1",  # UV_2_normal
    "1852f1880223351650409d0a0cd3e152981ff4baaeddbc1c3884de1d18269856",  # material_baseColor
    "d71e8157023c3f29ec1ded3447adf5e325fd82762a3f52a03a3982dde7586098",  # material_metallicRoughness
    "845b242b8da7dabefca78f8a7566da7bb110e41e0246936c2c8def55b1b73f59",  # material_normal
}


def nd_hashes():
    out = set(ND_TEXTURE_SHA256)
    if os.path.isdir(ND_DIR):          # belt and braces if the folder is still around
        for fn in os.listdir(ND_DIR):
            if fn.lower().endswith((".png", ".jpg", ".jpeg")):
                with open(os.path.join(ND_DIR, fn), "rb") as fh:
                    out.add(hashlib.sha256(fh.read()).hexdigest())
    return out


def main():
    if not os.path.exists(SRC):
        sys.exit(f"missing {SRC}")
    js, blob = read_glb(SRC)
    views = js["bufferViews"]
    banned = nd_hashes()

    def view_bytes(i):
        v = views[i]
        o = v.get("byteOffset", 0)
        return blob[o:o + v["byteLength"]]

    # ---- decide the fate of every image ----
    keep, drop = {}, set()
    tmp = tempfile.mkdtemp()
    for i, im in enumerate(js.get("images", [])):
        if "bufferView" not in im:
            drop.add(i); continue
        raw = view_bytes(im["bufferView"])
        name = im.get("name", f"image{i}")
        if hashlib.sha256(raw).hexdigest() in banned:
            print(f"  drop  {name:28s} {len(raw)/1e6:6.2f} MB  (CC-BY-ND, cannot be resized)")
            drop.add(i); continue
        src = os.path.join(tmp, f"{i}.png")
        out = os.path.join(tmp, f"{i}.jpg")
        with open(src, "wb") as fh:
            fh.write(raw)
        # A normal map stores a vector per texel and a metallicRoughness map
        # stores two unrelated channels; 4:2:0 chroma subsampling smears exactly
        # that data, so those get full chroma and a higher quality floor. Only
        # baseColor is a real colour image and can take the cheaper encode.
        data_map = ("normal" in name.lower() or "metallicroughness" in name.lower())
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", src,
             "-vf", f"scale='min({MAX_TEX},iw)':-1:flags=lanczos",
             "-pix_fmt", "yuvj444p" if data_map else "yuvj420p",
             "-q:v", str(JPEG_Q), out], check=True)
        with open(out, "rb") as fh:
            small = fh.read()
        print(f"  keep  {name:28s} {len(raw)/1e6:6.2f} MB -> {len(small)/1e6:5.2f} MB")
        keep[i] = (name, small)
    shutil.rmtree(tmp, ignore_errors=True)

    # ---- rebuild the buffer: mesh views verbatim, images re-encoded ----
    image_views = {im["bufferView"] for im in js.get("images", []) if "bufferView" in im}
    new_blob = bytearray()
    remap = {}
    new_views = []
    for i, v in enumerate(views):
        if i in image_views:
            continue
        off = len(new_blob)
        new_blob += view_bytes(i)
        new_blob += b"\0" * (-len(new_blob) % 4)
        nv = {"buffer": 0, "byteOffset": off, "byteLength": v["byteLength"]}
        for k in ("byteStride", "target"):
            if k in v:
                nv[k] = v[k]
        remap[i] = len(new_views)
        new_views.append(nv)

    img_remap = {}
    new_images = []
    for i, (name, data) in keep.items():
        off = len(new_blob)
        new_blob += data
        new_blob += b"\0" * (-len(new_blob) % 4)
        new_views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data)})
        img_remap[i] = len(new_images)
        new_images.append({"name": name, "mimeType": "image/jpeg",
                           "bufferView": len(new_views) - 1})

    for a in js.get("accessors", []):
        if "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
    js["bufferViews"] = new_views
    js["images"] = new_images
    js["buffers"] = [{"byteLength": len(new_blob)}]

    # ---- textures and materials that pointed at a dropped image go away ----
    tex_remap = {}
    new_tex = []
    for i, t in enumerate(js.get("textures", [])):
        srci = t.get("source")
        if srci in img_remap:
            nt = dict(t); nt["source"] = img_remap[srci]
            tex_remap[i] = len(new_tex)
            new_tex.append(nt)
    js["textures"] = new_tex

    def fix(slot):
        if slot and slot.get("index") in tex_remap:
            slot["index"] = tex_remap[slot["index"]]
            return slot
        return None

    for m in js.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        for key, holder in (("baseColorTexture", pbr), ("metallicRoughnessTexture", pbr),
                            ("normalTexture", m), ("occlusionTexture", m),
                            ("emissiveTexture", m)):
            if key in holder and fix(holder[key]) is None:
                del holder[key]
        # without a roughness map, give it a sane constant so it is not mirror-shiny
        if "metallicRoughnessTexture" not in pbr:
            pbr.setdefault("metallicFactor", 0.0)
            pbr.setdefault("roughnessFactor", 0.72)
        m["pbrMetallicRoughness"] = pbr
        m["doubleSided"] = False          # closed shell: back faces are wasted fill

    write_glb(DST, js, bytes(new_blob))
    a, b = os.path.getsize(SRC), os.path.getsize(DST)
    print(f"\n  {os.path.basename(SRC)} {a/1e6:.1f} MB  ->  "
          f"{os.path.basename(DST)} {b/1e6:.2f} MB   ({a/b:.0f}x smaller)")


if __name__ == "__main__":
    main()
