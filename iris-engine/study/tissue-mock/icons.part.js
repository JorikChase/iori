    const VGA = [[0,0,0],[128,0,0],[0,128,0],[128,128,0],[0,0,128],[128,0,128],[0,128,128],[192,192,192],[128,128,128],[255,0,0],[0,255,0],[255,255,0],[0,0,255],[255,0,255],[0,255,255],[255,255,255]];
    const B4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    function box(c, x, y, w, hh, col) { c.fillStyle = col; c.fillRect(x, y, w, hh); c.strokeRect(x + .5, y + .5, w - 1, hh - 1); }
    function disc(c, x, y, r, col, line = 1) { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fillStyle = col; c.fill(); if (line) c.stroke(); }
    const ICON = {
        eye(c) { c.beginPath(); c.moveTo(1.5, 16.5); c.quadraticCurveTo(16, 1, 30.5, 16.5); c.quadraticCurveTo(16, 32, 1.5, 16.5); c.fillStyle = '#fff'; c.fill(); c.stroke();
            const g = c.createRadialGradient(16, 16.5, 3, 16, 16.5, 8); g.addColorStop(0, '#0ff'); g.addColorStop(1, '#008080'); disc(c, 16, 16.5, 7.5, g); disc(c, 16, 16.5, 3, '#000', 0); c.fillStyle = '#fff'; c.fillRect(18, 12, 2, 2); },
        camera(c) { box(c, 11, 5, 10, 5, '#808080'); box(c, 2, 9, 28, 18, '#c0c0c0'); c.fillStyle = '#fff'; c.fillRect(3, 10, 26, 1); c.fillRect(3, 10, 1, 16); c.fillStyle = '#808080'; c.fillRect(3, 25, 26, 1); c.fillRect(28, 10, 1, 16);
            const g = c.createRadialGradient(14, 16, 1, 16, 18, 7); g.addColorStop(0, '#0ff'); g.addColorStop(.5, '#00f'); g.addColorStop(1, '#000080'); disc(c, 16, 18, 6.5, g); box(c, 4, 12, 5, 3, '#ff0'); c.fillStyle = '#f00'; c.fillRect(25, 12, 2, 2); },
        material(c) { c.beginPath(); c.ellipse(16, 16.5, 14, 11, -0.2, 0, 6.2832); const g = c.createLinearGradient(4, 6, 28, 28); g.addColorStop(0, '#fff'); g.addColorStop(1, '#c0c0c0'); c.fillStyle = g; c.fill(); c.stroke();
            disc(c, 23, 21, 2.6, '#808080'); [[8, 15, '#f00'], [12, 10, '#ff0'], [18, 8, '#0f0'], [24, 11, '#00f'], [9, 21, '#f0f'], [15, 24, '#808000']].forEach(([x, y, col]) => disc(c, x, y, 2.4, col, 0)); },
        relief(c) { box(c, 2, 26, 28, 4, '#008000'); c.beginPath(); c.moveTo(2.5, 26.5); c.lineTo(11.5, 7.5); c.lineTo(16.5, 17.5); c.lineTo(21.5, 11.5); c.lineTo(29.5, 26.5); c.closePath(); const g = c.createLinearGradient(4, 0, 28, 0); g.addColorStop(0, '#fff'); g.addColorStop(.45, '#c0c0c0'); g.addColorStop(1, '#404040'); c.fillStyle = g; c.fill(); c.stroke();
            c.beginPath(); c.moveTo(11.5, 7.5); c.lineTo(9, 14); c.lineTo(11.5, 12.5); c.lineTo(13, 15); c.lineTo(14.5, 13.5); c.closePath(); c.fillStyle = '#fff'; c.fill(); },
        flow(c) { for (const [y, col] of [[8, '#00f'], [16, '#008080'], [24, '#00f']]) { c.beginPath(); for (let x = 2; x <= 26; x++) { const yy = y + Math.sin(x * 0.55) * 2.6; x === 2 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.lineWidth = 4; c.strokeStyle = '#000'; c.stroke(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); c.lineWidth = 1; c.strokeStyle = '#000';
                const ye = y + Math.sin(26 * 0.55) * 2.6; c.beginPath(); c.moveTo(25, ye - 4); c.lineTo(31, ye); c.lineTo(25, ye + 4); c.closePath(); c.fillStyle = col; c.fill(); c.stroke(); } },
        fit(c) { disc(c, 16, 16, 13.5, '#fff'); disc(c, 16, 16, 9.5, '#f00'); disc(c, 16, 16, 5.5, '#fff'); disc(c, 16, 16, 2, '#f00'); c.beginPath(); c.moveTo(16, 0); c.lineTo(16, 9); c.moveTo(16, 23); c.lineTo(16, 32); c.moveTo(0, 16); c.lineTo(9, 16); c.moveTo(23, 16); c.lineTo(32, 16); c.stroke(); },
        photo(c) { box(c, 2, 4, 28, 24, '#fff'); c.fillStyle = '#000'; c.fillRect(4, 6, 24, 20); disc(c, 16, 16, 7.5, '#808000', 0); disc(c, 16, 16, 2.8, '#000', 0);
            c.strokeStyle = '#ff0'; c.beginPath(); c.arc(16, 16, 8.5, 0, 6.2832); c.stroke(); c.strokeStyle = '#0ff'; c.beginPath(); c.arc(16, 16, 3.5, 0, 6.2832); c.moveTo(16, 11); c.lineTo(16, 21); c.moveTo(11, 16); c.lineTo(21, 16); c.stroke(); c.strokeStyle = '#000'; },
        design(c) { c.save(); c.translate(16, 16); c.rotate(Math.PI / 4); box(c, -4, -15, 7, 5, '#f00'); box(c, -4, -10, 7, 3, '#c0c0c0'); box(c, -4, -7, 7, 14, '#ff0'); c.fillStyle = '#808000'; c.fillRect(0, -6, 2, 13);
            c.beginPath(); c.moveTo(-3.5, 7.5); c.lineTo(3.5, 7.5); c.lineTo(0, 15); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(-1.5, 12); c.lineTo(1.5, 12); c.lineTo(0, 15); c.closePath(); c.fillStyle = '#000'; c.fill(); c.restore(); },
        control(c) { box(c, 2, 5, 28, 22, '#c0c0c0'); c.fillStyle = '#fff'; c.fillRect(3, 6, 26, 1); c.fillRect(3, 6, 1, 20); for (const [y, x, col] of [[10, 9, '#f00'], [16, 19, '#00f'], [22, 13, '#008000']]) { c.fillStyle = '#000'; c.fillRect(6, y, 20, 2); box(c, x, y - 3, 5, 8, col); } },
    };
    function icon(name) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'); c.lineWidth = 1; c.strokeStyle = '#000'; ICON[name](c);
        quantise(c, 32); return cv.toDataURL();
    }
    function quantise(c, n) { const im = c.getImageData(0, 0, n, n), d = im.data;
        for (let i = 0; i < n * n; i++) { const o = i * 4; if (d[o + 3] < 128) { d[o + 3] = 0; continue; } const t = (B4[(Math.floor(i / n) & 3) * 4 + ((i % n) & 3)] / 16 - 0.47) * 56; let best = 0, bd = 1e9;
            for (let k = 0; k < 16; k++) { const p = VGA[k], e = (d[o] + t - p[0]) ** 2 + (d[o + 1] + t - p[1]) ** 2 + (d[o + 2] + t - p[2]) ** 2; if (e < bd) { bd = e; best = k; } }
            d[o] = VGA[best][0]; d[o + 1] = VGA[best][1]; d[o + 2] = VGA[best][2]; d[o + 3] = 255; }
        c.putImageData(im, 0, 0); }
