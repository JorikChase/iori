import json

with open('parsed_data.json', 'r', encoding='utf-8') as f:
    site_data = f.read()

html_content = f"""<!DOCTYPE html>
<html lang="cs" data-theme="playful">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZŠ Univerzum</title>
  <meta name="description" content="Soukromá základní škola UNIVERZUM s.r.o.">
  <!-- Load all necessary font families -->
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Nunito:wght@400;700;800&family=Inter:wght@400;600;800&family=Outfit:wght@400;600;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  
  <style>
    /* ========== FLUID VARIABLES & RESETS ========== */
    :root {{
       --spacing-base: clamp(1.5rem, 4vw, 4rem);
       --font-size-base: clamp(1rem, 1.2vw, 1.1rem);
       --font-size-h1: clamp(2.5rem, 6vw, 4rem);
       --font-size-h2: clamp(1.75rem, 4vw, 2.75rem);
    }}
    
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    
    /* ========== THEME: PLAYFUL (NEOBRUTALISM LITE) ========== */
    [data-theme="playful"] {{
       --bg-body: #fffbf7; /* Softer cream */
       --bg-panel: #ffffff;
       --text-main: #1c1917;
       --text-muted: #44403c;
       --c-primary: #fde047;  /* Highligher Yellow */
       --c-secondary: #fbcfe8; /* Soft pink */
       --font-head: 'Caveat', cursive;
       --font-body: 'Nunito', sans-serif;
       --border: 3px solid #1c1917;
       --shadow: 6px 6px 0px #1c1917;
       --shadow-hover: 2px 2px 0px #1c1917;
       --radius: 8px; 
       --trans: 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
       --nav-bg: #fffbf7;
       --nav-col: column;
       --glass: none;
       --panel-padding: var(--spacing-base);
    }}

    /* ========== THEME: CORPORATE (ELEVATED MINIMALISM) ========== */
    [data-theme="corporate"] {{
       --bg-body: #f8fafc;
       --bg-panel: #ffffff;
       --text-main: #0f172a;
       --text-muted: #475569;
       --c-primary: #4f46e5; /* Deep Indigo */
       --c-secondary: #e0e7ff; /* Very soft indigo for active bg */
       --font-head: 'Inter', sans-serif;
       --font-body: 'Inter', sans-serif;
       --border: none;
       --shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 40px -10px rgba(0,0,0,0.03);
       --shadow-hover: 0 10px 15px -3px rgba(0,0,0,0.08), 0 25px 40px -12px rgba(0,0,0,0.05);
       --radius: 12px;
       --trans: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
       --nav-bg: #f8fafc;
       --nav-col: column;
       --glass: none;
       --panel-padding: var(--spacing-base);
    }}

    /* ========== THEME: PREMIUM (TRUE GLASSMORPHISM) ========== */
    [data-theme="premium"] {{
       --bg-body: radial-gradient(circle at top right, #1e293b, #020617 80%);
       --bg-panel: rgba(255, 255, 255, 0.03);
       --text-main: #f8fafc;
       --text-muted: #cbd5e1;
       --c-primary: #d4af37; /* Clean Gold */
       --c-secondary: rgba(212, 175, 55, 0.1);
       --font-head: 'Outfit', sans-serif;
       --font-body: 'DM Sans', sans-serif;
       --border: 1px solid rgba(255, 255, 255, 0.1);
       --shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.35);
       --shadow-hover: 0 16px 48px 0 rgba(0, 0, 0, 0.5);
       --radius: 16px;
       --trans: 0.4s cubic-bezier(0.22, 1, 0.36, 1);
       --nav-bg: rgba(15, 23, 42, 0.85); /* Much darker to fix overlap */
       --nav-col: row;
       --glass: backdrop-filter: blur(32px) saturate(100%); -webkit-backdrop-filter: blur(32px) saturate(100%);
       --panel-padding: clamp(2rem, 5vw, 6rem);
    }}

    /* ========== GLOBAL STYLES & LAYOUT ========== */
    body {{
        font-family: var(--font-body);
        font-size: var(--font-size-base);
        background: var(--bg-body);
        background-attachment: fixed; /* Keep gradient still */
        color: var(--text-main);
        display: flex;
        min-height: 100vh;
        transition: background 0.6s ease, color 0.6s ease;
        line-height: 1.8;
        overflow-x: hidden;
    }}
    
    [data-theme="premium"] body {{ flex-direction: column; }}

    a {{ text-decoration: none; color: inherit; }}

    /* TYPOGRAPHY OVERRIDES (Fixing ugly legacy inline styles) */
    h1, h2, h3, h4, h5 {{ 
        font-family: var(--font-head); 
        color: var(--text-main); 
        margin-bottom: 1.25rem; 
        text-align: left; /* No centered unseemly text */
    }}
    h1 {{ font-size: var(--font-size-h1); line-height: 1.1; margin-top: 1rem; }}
    h2 {{ font-size: var(--font-size-h2); line-height: 1.2; margin-top: 2rem; }}
    
    /* Playful specific font weight */
    [data-theme="playful"] h1, [data-theme="playful"] h2 {{ font-weight: 700; line-height: 1.1; letter-spacing: 2px; }}
    /* Corporate specific spacing */
    [data-theme="corporate"] h1, [data-theme="corporate"] h2 {{ font-weight: 800; letter-spacing: -0.04em; color: #0f172a; }}
    /* Premium specific sleekness */
    [data-theme="premium"] h1, [data-theme="premium"] h2 {{ font-weight: 800; letter-spacing: -0.02em; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.5); }}

    p {{ margin-bottom: 1.5rem; color: var(--text-muted); text-align: left; }}

    /* ========== SIDEBAR / TOPNAV ========== */
    #sidebar {{
        width: 320px;
        background: var(--nav-bg);
        padding: var(--spacing-base);
        display: flex;
        flex-direction: var(--nav-col);
        gap: 2.5rem;
        z-index: 50;
        flex-shrink: 0;
        transition: all 0.6s ease;
    }}
    
    [data-theme="playful"] #sidebar {{ border-right: var(--border); }}
    
    /* True Glassmorphism fixing the broken background */
    [data-theme="premium"] #sidebar {{
        width: 100%;
        padding: 1.5rem clamp(2rem, 5vw, 6rem);
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        border-right: none;
        var(--glass);
        background: var(--nav-bg);
        position: sticky;
        top: 0;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
        z-index: 999;
    }}

    .logo h2 {{ font-size: clamp(2rem, 3.5vw, 3rem); margin: 0; display: inline-block; cursor: pointer; }}
    [data-theme="playful"] .logo h2 {{ transform: rotate(-2deg); }}
    [data-theme="corporate"] .logo h2 {{ color: var(--c-primary); letter-spacing: -1.5px; font-weight: 800; }}
    [data-theme="premium"] .logo h2 {{ color: #ffffff; white-space: nowrap; }}
    
    #main-panel {{
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: var(--panel-padding);
        max-width: 1800px;
        margin: 0 auto;
        min-width: 0; 
    }}

    #burger-menu {{
        display: none;
        background: transparent; border: none; cursor: pointer;
        width: 44px; height: 44px;
        flex-direction: column; justify-content: space-around; padding: 10px;
        z-index: 1000;
        transition: all 0.3s;
    }}
    #burger-menu span {{
        display: block; width: 100%; height: 3px; background: var(--text-main);
        transition: all 0.3s ease; border-radius: 2px;
    }}
    [data-theme="playful"] #burger-menu {{ background: var(--c-primary); border: 2px solid #1c1917; border-radius: var(--radius); box-shadow: 2px 2px 0 #1c1917; }}
    [data-theme="corporate"] #burger-menu {{ background: #f1f5f9; border-radius: 8px; border: 1px solid #cbd5e1; }}
    [data-theme="premium"] #burger-menu {{ background: rgba(255,255,255,0.05); border-radius: 8px; border: var(--border); }}
    [data-theme="premium"] #burger-menu span {{ background: #fff; }}
    
    body.nav-open #burger-menu span:nth-child(1) {{ transform: translateY(7px) rotate(45deg); }}
    body.nav-open #burger-menu span:nth-child(2) {{ opacity: 0; }}
    body.nav-open #burger-menu span:nth-child(3) {{ transform: translateY(-7px) rotate(-45deg); }}

    /* ========== NAVIGATION BLOCKS ========== */
    #main-nav {{
        display: flex;
        flex-direction: var(--nav-col);
        gap: 0.5rem;
    }}
    [data-theme="premium"] #main-nav {{ margin-left: auto; gap: 2rem; }}

    .nav-item {{
        font-weight: 700;
        padding: 0.8rem 1.2rem;
        border-radius: var(--radius);
        transition: all var(--trans), transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: inline-flex;
        align-items: center;
        position: relative;
        z-index: 1;
    }}
    
    /* Playful Sticky Notes Logic */
    [data-theme="playful"] .nav-item {{ background: transparent; border: none; border-radius: 0; }}
    [data-theme="playful"] .nav-item:hover, [data-theme="playful"] .nav-item.active {{ 
        background: var(--c-primary); 
        box-shadow: 4px 5px 15px rgba(0,0,0,0.15); 
        transform: rotate(-2deg) scale(1.05); 
        z-index: 10;
    }}

    [data-theme="corporate"] .nav-item {{ color: var(--text-muted); font-size: 1.05rem; padding: 0.75rem 1.2rem; border-left: 4px solid transparent; border-radius: 0 8px 8px 0; font-weight: 600; }}
    [data-theme="corporate"] .nav-item:hover {{ color: var(--text-main); background: #f1f5f9; }}
    [data-theme="corporate"] .nav-item.active {{ color: var(--c-primary); background: var(--c-secondary); border-left: 4px solid var(--c-primary); }}

    [data-theme="premium"] .nav-item {{ color: var(--text-muted); font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.5rem 0; border-radius: 0; font-weight: 500; }}
    [data-theme="premium"] .nav-item::after {{ content: ''; position: absolute; bottom: -5px; left: 0; width: 0%; height: 2px; background: var(--c-primary); transition: width var(--trans); }}
    [data-theme="premium"] .nav-item:hover {{ color: #ffffff; }}
    [data-theme="premium"] .nav-item:hover::after, [data-theme="premium"] .nav-item.active::after {{ width: 100%; }}
    [data-theme="premium"] .nav-item.active {{ color: #ffffff; }}

    /* ========== SUB NAV (Chips) ========== */
    #sub-nav {{
        display: flex;
        gap: 0.75rem;
        margin-bottom: 2.5rem;
        flex-wrap: wrap;
    }}
    
    .subnav-item {{
        padding: 0.6rem 1.25rem;
        font-weight: 600;
        font-size: 0.95rem;
        border-radius: 50px;
        transition: all var(--trans), transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        white-space: nowrap;
        position: relative;
        z-index: 1;
    }}

    [data-theme="playful"] .subnav-item {{ background: transparent; border: none; border-radius: 0; color: var(--text-main); }}
    [data-theme="playful"] .subnav-item:hover, [data-theme="playful"] .subnav-item.active {{ 
        background: var(--c-primary); 
        transform: rotate(-2deg) scale(1.05); 
        box-shadow: 3px 4px 10px rgba(0,0,0,0.15);
    }}

    [data-theme="corporate"] .subnav-item {{ background: #ffffff; color: var(--text-muted); box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #cbd5e1; font-weight: 600; }}
    [data-theme="corporate"] .subnav-item:hover {{ border-color: var(--c-primary); color: var(--c-primary); }}
    [data-theme="corporate"] .subnav-item.active {{ background: var(--c-primary); color: #ffffff; border-color: var(--c-primary); box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); }}

    [data-theme="premium"] .subnav-item {{ border: var(--border); color: var(--text-main); background: transparent; var(--glass); font-weight: 500; font-family: 'Outfit', sans-serif; letter-spacing: 0.5px; }}
    [data-theme="premium"] .subnav-item:hover {{ background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); }}
    [data-theme="premium"] .subnav-item.active {{ background: var(--c-primary); border-color: var(--c-primary); color: #020617; font-weight: 600; }}

    /* ========== CONTENT AREA RESTYLING (The Fixes) ========== */
    #content-container {{
        background: var(--bg-panel);
        padding: var(--panel-padding);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        border: var(--border);
        transition: all var(--trans);
        will-change: opacity, transform;
        width: 100%;
        /* Removed max-width restriction to enable glorious full widescreen text scaling */
    }}
    
    [data-theme="premium"] #content-container {{ var(--glass); }}

    /* Strip all ugly <font>, <div> colors, and legacy alignments rigidly inside headers */
    #content-area * {{ text-align: left !important; }}
    #content-area h1 *, #content-area h2 *, #content-area h3 * {{
        background: transparent !important;
        border: none !important;
        color: inherit !important;
    }}
    #content-area h1, #content-area h2, #content-area h3 {{ background: transparent !important; border: none !important; }}
    [data-theme="corporate"] #content-area h1, [data-theme="corporate"] #content-area h2 {{ color: var(--c-primary) !important; }}
    
    #content-area font, #content-area span {{ color: inherit !important; font-family: inherit !important; font-size: inherit !important; background: transparent !important; }}
    
    /* Global element fixes */
    #content-area img {{ max-width: 100%; height: auto; border-radius: var(--radius); margin: 2rem auto; display: block; box-shadow: var(--shadow); }}
    #content-area ul, #content-area ol {{ margin-left: 1.5rem; margin-bottom: 2rem; color: var(--text-muted); }}
    #content-area li {{ margin-bottom: 0.75rem; }}
    
    /* Beautiful Tables */
    #content-area table {{ width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 2.5rem; border-radius: var(--radius); overflow: hidden; }}
    #content-area td, #content-area th {{ padding: 1.25rem 1rem; border-bottom: 1px solid rgba(150,150,150,0.2); color: var(--text-muted); vertical-align: top; }}
    [data-theme="corporate"] #content-area th {{ background: #f8fafc; font-weight: 600; color: #0f172a; }}
    [data-theme="playful"] #content-area table {{ border: var(--border); box-shadow: var(--shadow); }}
    [data-theme="playful"] #content-area td, [data-theme="playful"] #content-area th {{ border-bottom: 3px solid #1c1917; }}
    
    /* ========== LOGIN FORM FIXES (pg=9) ========== */
    #content-area input[type="text"], #content-area input[type="password"] {{
        width: 100%; max-width: 400px;
        padding: 0.8rem 1.2rem; margin: 0.5rem 0 1.5rem 0;
        border-radius: var(--radius);
        border: 2px solid var(--text-muted);
        background: var(--bg-body);
        color: var(--text-main);
        font-family: var(--font-body);
        font-size: 1rem;
        transition: border-color 0.2s, box-shadow 0.2s;
    }}

    [data-theme="corporate"] #content-area input {{ border: 1px solid #cbd5e1; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); }}
    [data-theme="corporate"] #content-area input:focus {{ outline: none; border-color: var(--c-primary); box-shadow: 0 0 0 3px var(--c-secondary); }}
    [data-theme="premium"] #content-area input {{ background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.2); color: #fff; }}
    [data-theme="premium"] #content-area input:focus {{ outline: none; border-color: var(--c-primary); }}

    #content-area input[type="submit"], #content-area input[type="button"] {{
        background: var(--c-primary); color: #fff; border: none; padding: 0.8rem 2rem;
        border-radius: var(--radius); font-weight: 700; cursor: pointer; transition: all var(--trans);
        font-family: var(--font-body); font-size: 1rem;
    }}
    
    [data-theme="playful"] #content-area input[type="submit"] {{ border: var(--border); box-shadow: 3px 3px 0px #1c1917; color: #1c1917; }}
    [data-theme="playful"] #content-area input[type="submit"]:hover {{ transform: translate(-2px,-2px); box-shadow: 5px 5px 0px #1c1917; }}
    [data-theme="corporate"] #content-area input[type="submit"] {{ background: var(--c-primary); box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); }}
    [data-theme="corporate"] #content-area input[type="submit"]:hover {{ background: #4338ca; }}
    [data-theme="premium"] #content-area input[type="submit"] {{ color: #020617; }}

    /* Nuke the legacy red warnings and craft them cleanly per palette via JS classes */
    #content-area .login-warning-box, #content-area .login-success-box {{
        border-radius: var(--radius) !important;
        padding: 1.5rem !important;
        background: rgba(239, 68, 68, 0.1) !important;
        color: #b91c1c !important;
        font-weight: 600 !important;
        border: none !important;
        box-shadow: none !important;
        margin-bottom: 1.5rem !important;
        display: block !important;
        width: 100% !important; 
        max-width: 600px !important;
        margin-left: 0 !important; 
    }}
    
    #content-area .login-success-box {{
        background: rgba(34, 197, 94, 0.1) !important;
        color: #15803d !important;
    }}
    
    [data-theme="playful"] #content-area .login-warning-box, [data-theme="playful"] #content-area .login-success-box {{
        background: rgba(254, 240, 138, 0.5) !important; 
        border: 2px solid #1c1917 !important;
        box-shadow: 4px 4px 0px rgba(0,0,0,0.1) !important;
        transform: rotate(1deg) !important;
    }}
    
    [data-theme="corporate"] #content-area .login-warning-box, [data-theme="corporate"] #content-area .login-success-box {{
        background: #fef2f2 !important;
        border-left: 4px solid #ef4444 !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
    }}
    [data-theme="corporate"] #content-area .login-success-box {{ border-left: 4px solid #22c55e !important; background: #f0fdf4 !important; }}
    
    [data-theme="premium"] #content-area .login-warning-box, [data-theme="premium"] #content-area .login-success-box {{ 
        color: #fca5a5 !important; 
        background: rgba(239, 68, 68, 0.15) !important; 
        border: 1px solid rgba(239, 68, 68, 0.3) !important;
        backdrop-filter: blur(8px) !important;
    }}
    [data-theme="premium"] #content-area .login-success-box {{ color: #86efac !important; background: rgba(34, 197, 94, 0.15) !important; border: 1px solid rgba(34, 197, 94, 0.3) !important; }}

    /* ========== LANDING PAGE HERO GRID ========== */
    .hero-contact-grid {{
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
    }}
    .hero-contact-grid > h1, .hero-contact-grid > h2 {{ margin-bottom: 0.5rem; }}
    .hero-contact-grid > p {{
        background: var(--bg-body);
        padding: 2.5rem;
        border-radius: var(--radius);
        margin: 0;
        border: 1px solid rgba(150,150,150,0.2);
        box-shadow: 0 4px 10px rgba(0,0,0,0.02);
        display: block; 
        width: 100%; 
    }}
    [data-theme="playful"] .hero-contact-grid > p {{ border: var(--border); box-shadow: var(--shadow); }}
    [data-theme="premium"] .hero-contact-grid > p {{ background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); }}
    
    @media (min-width: 900px) {{
        /* Keeps full width but ensures desktop scaling is wide */
    }}

    /* ========== THEME CYCLER FIX ========== */
    #theme-cycler {{
        position: fixed;
        bottom: 2.5rem;
        right: 2.5rem;
        background: var(--text-main);
        color: var(--bg-body);
        border: none;
        padding: 1rem;
        border-radius: 50%;
        font-size: 1.5rem;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        z-index: 9999;
        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s;
        width: 64px; height: 64px;
    }}
    
    [data-theme="playful"] #theme-cycler {{ background: var(--c-primary); color: #1c1917; border: var(--border); box-shadow: var(--shadow); }}
    #theme-cycler:hover {{ transform: scale(1.1) rotate(15deg); }}

    /* ========== GLOBAL MOBILE ADJUSTMENTS (Responsivity Fix) ========== */
    @media (max-width: 768px) {{
        body {{ flex-direction: column; }}
        
        #sidebar {{
            width: 100%;
            padding: 0.75rem 1rem;
            position: relative; /* Fixed: Removed strict sticky overlap on mobile so 100% of viewport is readable */
            top: auto;
            border-right: none;
            border-bottom: var(--border);
            box-shadow: 0 4px 12px rgba(0,0,0,0.08); 
            z-index: 100;
        }}
        [data-theme="playful"] #sidebar {{ box-shadow: 0px 4px 0px #1c1917; border-bottom: 3px solid #1c1917; }}
        [data-theme="premium"] #sidebar {{ padding: 1rem; var(--glass); display: block; }} 
        
        .logo {{ display: flex; justify-content: space-between; align-items: center; width: 100%; }}
        .logo h2 {{ font-size: clamp(1.5rem, 5vw, 2rem); margin-bottom: 0; }}
        #burger-menu {{ display: flex; }}

        #main-nav {{
            flex-direction: row;
            flex-wrap: wrap; 
            justify-content: flex-start;
            border-bottom: none; 
            -ms-overflow-style: none;
            scrollbar-width: none;
            gap: 0.75rem;
            
            /* Hamburger Accordion Logic */
            max-height: 0; opacity: 0; overflow: hidden;
            transition: max-height 0.4s cubic-bezier(0, 1, 0, 1), opacity 0.3s ease, padding 0.3s ease;
            margin-bottom: 0; padding-bottom: 0;
        }}
        body.nav-open #main-nav {{ max-height: 1000px; opacity: 1; margin-top: 1rem; padding-bottom: 1rem; transition: max-height 0.4s ease-in, opacity 0.4s ease; }}
        
        [data-theme="playful"] #main-nav {{ border-bottom: none; }}
        
        .nav-item {{ white-space: nowrap; padding: 0.5rem 0.8rem; font-size: 0.95rem; }}
        [data-theme="playful"] .nav-item {{ background: #fefce8; border: 2px solid #1c1917; border-radius: var(--radius); box-shadow: none; }}
        [data-theme="playful"] .nav-item.active {{ background: var(--c-primary); transform: translateY(-2px); box-shadow: 2px 2px 0 #1c1917; }}
        
        [data-theme="corporate"] .nav-item {{ border-left: none; border-bottom: 3px solid transparent; border-radius: 8px 8px 0 0; }}
        [data-theme="corporate"] .nav-item.active {{ border-left: none; border-bottom: 3px solid var(--c-primary); }}

        [data-theme="premium"] #main-nav {{ margin-left: 0; gap: 1.5rem; }}

        /* The explicitly requested padding fix applied to all pallettes */
        #main-panel {{ padding: 10px; width: 100vw; box-sizing: border-box; overflow-x: hidden; }}
        #content-container {{ padding: 1.5rem 1rem !important; margin: 0 auto; width: 100%; box-sizing: border-box; overflow-x: hidden; }}
        
        #sub-nav {{ 
            flex-wrap: wrap; justify-content: flex-start; gap: 0.5rem; 
            max-height: 0; opacity: 0; overflow: hidden;
            transition: max-height 0.4s cubic-bezier(0, 1, 0, 1), opacity 0.3s ease, padding 0.3s ease;
            margin-bottom: 0; padding-bottom: 0;
        }}
        body.nav-open #sub-nav {{ max-height: 1000px; opacity: 1; padding-bottom: 1rem; margin-bottom: 1rem; transition: max-height 0.4s ease-in, opacity 0.4s ease; }}

        #theme-cycler {{ width: 50px; height: 50px; bottom: 1.5rem; right: 1.5rem; font-size: 1.2rem; }}
    }}
  </style>
</head>
<body>

  <aside id="sidebar">
    <div class="logo">
      <h2 class="magnetic" onclick="window.location.hash=''; document.body.classList.remove('nav-open');">ZŠ Univerzum</h2>
      <button id="burger-menu" aria-label="Toggle Menu" onclick="document.body.classList.toggle('nav-open')">
          <span></span><span></span><span></span>
      </button>
    </div>
    <nav id="main-nav"></nav>
  </aside>

  <section id="main-panel">
    <nav id="sub-nav"></nav>
    <div id="content-container">
        <main id="content-area"></main>
    </div>
  </section>

  <button id="theme-cycler" class="magnetic" title="Change Theme">✨</button>

  <script>
    const SITE_DATA = {site_data};
    
    // Theme Management
    const THEMES = ['playful', 'corporate', 'premium'];
    let currentThemeIdx = THEMES.indexOf(localStorage.getItem('uni-theme') || 'playful');
    if(currentThemeIdx === -1) currentThemeIdx = 0; // Default to Playful
    document.documentElement.setAttribute('data-theme', THEMES[currentThemeIdx]);

    document.getElementById('theme-cycler').addEventListener('click', () => {{
        currentThemeIdx = (currentThemeIdx + 1) % THEMES.length;
        const newTheme = THEMES[currentThemeIdx];
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('uni-theme', newTheme);
        
        // Soft transition
        const containerDiv = document.getElementById('content-container');
        containerDiv.animate([
            {{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(4px)' }},
            {{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }}
        ], {{ duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }});
        
        // Re-attach magnetic
        setTimeout(attachMagnetic, 50);
    }});

    // Router Logic
    const render = () => {{
        const hash = window.location.hash.replace('#', '') || '1';
        let [pg, sm] = hash.split('-');
        if (!pg && !sm) pg = 'index';

        const page = SITE_DATA[pg] || SITE_DATA['index'] || SITE_DATA['1'];
        if(!page) return;
        
        const topMenu = page.menu || SITE_DATA['1'].menu || [];
        document.getElementById('main-nav').innerHTML = topMenu.map(m => 
            `<a href="#${{m.id}}" class="nav-item magnetic ${{m.id === pg ? 'active' : ''}}">${{m.text}}</a>`
        ).join('');

        const subNav = page.submenu || [];
        const subNavDiv = document.getElementById('sub-nav');
        if(subNav.length > 0) {{
            subNavDiv.innerHTML = subNav.map(s => 
                `<a href="#${{s.pg}}-${{s.sm}}" class="subnav-item magnetic ${{s.sm === sm ? 'active' : ''}}">${{s.text}}</a>`
            ).join('');
            subNavDiv.style.display = 'flex';
        }} else {{
            subNavDiv.innerHTML = '';
            subNavDiv.style.display = 'none';
        }}

        let content = page.content;
        let title = page.title;
        if (sm && page.subpages && page.subpages[sm]) {{
            content = page.subpages[sm].content || content;
            if(page.subpages[sm].title) title = page.subpages[sm].title;
        }}
        
        // Inject Hero Grid explicitly on Landing Page
        if (pg === '1' && !sm) {{
            content = `<div class="hero-contact-grid">${{content}}</div>`;
        }}
        
        const contentDiv = document.getElementById('content-area');
        contentDiv.innerHTML = content || '<p>Obsah se připravuje...</p>';
        
        // Specific legacy sweeping
        if (pg === '9') {{
            const divNodes = contentDiv.querySelectorAll('div[style]');
            divNodes.forEach(d => {{
                const bg = d.style.backgroundColor.replace(/\\s/g, '').toLowerCase();
                if (bg === 'rgb(255,0,0)' || bg === '#ff0000' || bg === 'red') {{
                    d.removeAttribute('style');
                    d.className = 'login-warning-box';
                }}
                if (bg === 'rgb(128,255,0)' || bg === '#80ff00' || bg === 'rgb(128, 255, 0)') {{
                    d.removeAttribute('style');
                    d.className = 'login-success-box';
                }}
            }});
        }}
        
        const containerDiv = document.getElementById('content-container');
        containerDiv.animate([
            {{ opacity: 0, transform: 'translateY(15px)' }},
            {{ opacity: 1, transform: 'translateY(0)' }}
        ], {{ duration: 300, easing: 'ease-out' }});
        
        document.title = title ? `ZŠ Univerzum | ${{title}}` : 'ZŠ Univerzum';

        setTimeout(attachMagnetic, 50);
    }};

    // Bulletproof Magnetic Code (No Cloning)
    function attachMagnetic() {{
        const attractors = document.querySelectorAll('.magnetic');
        
        attractors.forEach(element => {{
            // Ensure we don't double attach
            if(element.getAttribute('data-magnetic-bound') === 'true') return;
            element.setAttribute('data-magnetic-bound', 'true');
            
            element.addEventListener('mousemove', e => {{
                if(window.innerWidth < 768) return;
                
                const rect = element.getBoundingClientRect();
                const h = rect.width / 2;
                const w = rect.height / 2;
                const x = e.clientX - rect.left - h;
                const y = e.clientY - rect.top - w;
                
                element.style.transform = `translate(${{x * 0.15}}px, ${{y * 0.15}}px)`;
            }});
            
            element.addEventListener('mouseleave', () => {{
                element.style.transform = 'translate(0px, 0px)';
            }});
        }});
    }}

    window.addEventListener('hashchange', render);
    
    document.addEventListener("DOMContentLoaded", () => {{
        render();
    }});
    
  </script>
</body>
</html>
"""

with open('univerzum.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Generated univerzum.html with V2 Polish features perfectly integrated!")
