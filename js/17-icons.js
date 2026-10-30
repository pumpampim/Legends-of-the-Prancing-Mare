/* ===== Рисованные иконки вместо эмодзи (2026-10-30) =====
   Эмодзи в заголовках, кнопках, подписях и вкладках заменяются на свои контурные иконки в духе северной гравюры
   (золотой контур, как у компаса и рамок). Иконки нарисованы с нуля, ничего из игры не взято.
   Сам символ эмодзи остаётся в тексте (спрятан визуально), поэтому textContent/innerText кнопок не меняется —
   код и проверки, которые ищут кнопку по тексту, работают как раньше. Нет рисунка для эмодзи — он остаётся как есть. */
(function () {
    var P = {
        book: '<path d="M12 6c-2-1.5-5-2-8-1v14c3-1 6-.5 8 1 2-1.5 5-2 8-1V5c-3-1-6-.5-8 1z"/><path d="M12 6v14"/><path d="M7 9h2M15 9h2"/>',
        tome: '<path d="M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2z"/><path d="M6 19a2 2 0 0 1 2-2h11"/><path d="M12.5 7l1.2 2.4 2.3.4-1.7 1.6.4 2.4-2.2-1.2-2.2 1.2.4-2.4-1.7-1.6 2.3-.4z"/>',
        cycle: '<path d="M19 9a7 7 0 0 0-13-1"/><path d="M5 4v4h4"/><path d="M5 15a7 7 0 0 0 13 1"/><path d="M19 20v-4h-4"/>',
        scroll: '<path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H5a2 2 0 0 1 0-4h1V6a2 2 0 0 1 1-2z"/><path d="M17 8H8M6 16h9a2 2 0 0 1 0 4"/><path d="M9 11h5M9 13.5h4"/>',
        pin: '<path d="M12 21s-6-6.3-6-11a6 6 0 0 1 12 0c0 4.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
        calendar: '<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M4 9h16M8 3v4M16 3v4"/><path d="M8 13h2M12 13h2M16 13h0M8 16h2M12 16h2"/>',
        shop: '<path d="M3 9l2-5h14l2 5"/><path d="M3 9c0 1.5 1.3 2.5 3 2.5S9 10.5 9 9c0 1.5 1.3 2.5 3 2.5S15 10.5 15 9c0 1.5 1.3 2.5 3 2.5S21 10.5 21 9"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>',
        map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/><path d="M11 10l2 2M13 10l-2 2"/>',
        die: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5L12 12l8-4.5M12 12v9"/><circle cx="12" cy="7.5" r=".9"/><circle cx="8" cy="14" r=".9"/><circle cx="16" cy="14" r=".9"/>',
        next: '<path d="M5 6l7 6-7 6z"/><path d="M12 6l7 6-7 6z"/>',
        save: '<path d="M4 9h16v10H4z"/><path d="M4 9l2-4h12l2 4"/><path d="M12 11v5M9.5 13.5L12 16l2.5-2.5"/>',
        folder: '<path d="M6 9h12l1 11H5z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M12 12v5M9.5 14.5L12 12l2.5 2.5"/>',
        arrow: '<path d="M4 12h14"/><path d="M13 7l5 5-5 5"/><path d="M4 9l2 3-2 3"/>',
        hourglass: '<path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/><path d="M9.5 18h5"/>',
        tent: '<path d="M3 20L12 4l9 16z"/><path d="M12 4v16M9 20l3-6 3 6"/>',
        orb: '<circle cx="12" cy="10" r="6"/><path d="M9 8a3 3 0 0 1 3-2"/><path d="M7 20h10l-2-4H9z"/>',
        sparkle: '<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z"/><path d="M19 3v3M17.5 4.5h3"/>',
        hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.3-5.5-3.5L4 14a1.5 1.5 0 0 1 2.4-1.8z"/>',
        target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
        handshake: '<path d="M3 11l4-4 5 3 5-3 4 4"/><path d="M7 7l-2 9 4 3 5-2 5-5"/><path d="M10 14l2 2M12 12l2 2"/>',
        hood: '<path d="M12 3c-5 0-8 5-8 10v8h16v-8c0-5-3-10-8-10z"/><path d="M8 21v-6a4 4 0 0 1 8 0v6"/><path d="M10 15h.01M14 15h.01"/>',
        bow: '<path d="M6 3c8 3 8 15 0 18"/><path d="M6 3v18"/><path d="M4 12h15"/><path d="M16 9.5l3 2.5-3 2.5"/><path d="M4 10.5L2.5 12 4 13.5"/>',
        burst: '<path d="M12 2l2 6 6-3-3 6 5 2-6 2 3 6-6-3-1 5-2-5-6 3 3-6-6-2 5-2-3-6 6 3z"/>',
        staff: '<path d="M5 21L15 11"/><circle cx="17" cy="7" r="3"/><path d="M17 2v1.5M21.5 7H20M20.2 3.8l-1 1"/><path d="M13 9.5l1.5 1.5"/>',
        bolt: '<path d="M13 2L5 13h6l-1 9 8-12h-6z"/>',
        herb: '<path d="M12 21V9"/><path d="M12 13c-4 0-7-3-7-7 4 0 7 3 7 7z"/><path d="M12 10c3 0 6-2.5 6-6-3.5 0-6 2.5-6 6z"/><path d="M12 17c2.5 0 4.5-1.5 5-4-2.5 0-4.5 1.5-5 4z"/>',
        rod: '<path d="M3 21L18 4"/><path d="M18 4c1.5 3 2 6 1 9"/><path d="M19 13a1.5 1.5 0 1 1-1.5 1.5"/><path d="M6 18l2 2"/>',
        sleep: '<path d="M14 4a8 8 0 1 0 6 12 7 7 0 0 1-6-12z"/><path d="M15 6h3l-3 3h3"/>',
        lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/><circle cx="12" cy="15.5" r="1.3"/><path d="M12 17v2"/>',
        purse: '<path d="M8 6h8l-1.5 3c3 1.5 5 4.5 5 7.5C19.5 19.5 16 21 12 21s-7.5-1.5-7.5-4.5c0-3 2-6 5-7.5z"/><path d="M9.5 9h5"/><path d="M12 12v6M10.5 13.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5-1.5 1.5-1.5 1.5-1.5.7-1.5 1.5.7 1.5 1.5 1.5 1.5-.7 1.5-1.5"/>',
        pinch: '<path d="M7 20c-2-2-3-4-3-7l2-5 2 1v4"/><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6"/><path d="M11 11l2-4a1.5 1.5 0 0 1 2.6 1.5L14 12"/><circle cx="17.5" cy="5" r="2.5"/><path d="M7 20h7c2 0 3-1.5 3-3.5V13"/>',
        banner: '<path d="M6 3v18"/><path d="M6 4h12v11l-3-2-3 2-3-2-3 2"/><path d="M10 8l2-2 2 2-2 2z"/>',
        coffin: '<path d="M9 2h6l3 6-3 14H9L6 8z"/><path d="M12 7v7M9.5 9.5h5"/>',
        scales: '<path d="M12 3v17M7 21h10M4 7h16"/><path d="M6 7l-3 7h6zM18 7l-3 7h6z"/><path d="M3 14a3 2 0 0 0 6 0M15 14a3 2 0 0 0 6 0"/>',
        search: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21"/><path d="M7.5 8.5a3 3 0 0 1 2.5-1.5"/>',
        send: '<path d="M3 11l18-7-6 17-3-7z"/><path d="M12 14l9-10"/>',
        compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5L13.5 13.5 8.5 15.5 10.5 10.5z"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
        trash: '<path d="M5 7h14M10 7V4h4v3"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
        shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M12 3v18M5 11h14"/>',
        ring: '<circle cx="12" cy="15" r="6"/><circle cx="12" cy="15" r="3.8"/><path d="M9.5 7L12 3l2.5 4-2.5 2.2z"/>',
        dagger: '<path d="M14 4l6-1-1 6-8.5 8.5-4-4z"/><path d="M5 13l6 6M3 21l3.5-3.5"/>',
        paw: '<ellipse cx="12" cy="16" rx="4" ry="3.5"/><circle cx="6.5" cy="10.5" r="1.8"/><circle cx="17.5" cy="10.5" r="1.8"/><circle cx="9.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/>',
        basket: '<path d="M3 10h18l-2 10H5z"/><path d="M7 10l4-6M17 10l-4-6"/><path d="M9 13v4M12 13v4M15 13v4"/>',
        tunic: '<path d="M8 3l-5 4 3 3 2-1v12h8V9l2 1 3-3-5-4"/><path d="M8 3c1 2 2.5 3 4 3s3-1 4-3"/><path d="M8 13h8"/>',
        list: '<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 12.5h7M9 16h4"/>',
        plus: '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9.5"/>',
        letter: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 7l9 6 9-6"/><circle cx="12" cy="15.5" r="1.6"/>',
        satchel: '<path d="M6 9h12l1 11H5z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M6 12h12"/><path d="M11 12v3h2v-3"/>',
        castle: '<path d="M4 21V9h3v2h2V9h2v3h2V9h2v2h2V9h3v12z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/><path d="M12 9V4l3 1-3 1"/>',
        bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M12 3v2"/>',
        bellOff: '<path d="M6 17V11a6 6 0 0 1 9.5-4.9M18 11v6l2 2H8"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M3 3l18 18"/>',
        check: '<path d="M4 13l5 5L20 6"/>',
        speech: '<path d="M4 5h16v11H10l-4 4v-4H4z"/><path d="M8 9h8M8 12h5"/>',
        hammer: '<path d="M4 20l9-9"/><path d="M11 6l3-3 7 7-3 3z"/><path d="M14 9l-3-3"/>',
        flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 0 2 1 3.5 2.5 3.5 0-3.5-1-5.5 0-8.5z"/><path d="M12 21a2.2 2.2 0 0 1-2.2-2.2c0-1.4 1.2-2.2 2.2-3.8 1 1.6 2.2 2.4 2.2 3.8A2.2 2.2 0 0 1 12 21z"/>',
        ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
        bowl: '<path d="M3 11h18a9 7 0 0 1-18 0z"/><path d="M8 21h8"/><path d="M9 4c-1 1.5 1 2.5 0 4M13 4c-1 1.5 1 2.5 0 4"/>',
        alembic: '<path d="M9 3h4M10 3v5l-5 9a2.5 2.5 0 0 0 2 4h8a2.5 2.5 0 0 0 2-4l-5-9V3"/><path d="M7 15h10"/><path d="M13 6h4l3 3"/>',
        lute: '<ellipse cx="9" cy="15" rx="5.5" ry="5.5"/><circle cx="9" cy="15" r="1.6"/><path d="M13 11l7-7"/><path d="M18 3l3 3"/>',
        key: '<circle cx="7" cy="12" r="4"/><path d="M11 12h10M17 12v3M20 12v2"/>',
        eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        village: '<path d="M2 21V13l5-5 5 5v8"/><path d="M12 21v-6l5-5 5 5v6"/><path d="M5 21v-4h4v4M15 21v-3h4v3"/>',
        college: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5"/><path d="M22 9v6"/>',
        chart: '<path d="M4 4v16h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
        up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
        down: '<path d="M12 4v15M6 13l6 6 6-6"/>',
        swords: '<path d="M4 4l10 10M4 4h3l9 9"/><path d="M20 4L10 14M20 4h-3l-9 9"/><path d="M12 17l-3 3M6 14l-2 2 4 4 2-2"/><path d="M12 17l3 3M18 14l2 2-4 4-2-2"/>',
        potion: '<path d="M10 3h4M10.5 3v5L6 15a4.5 4.5 0 0 0 4 6h4a4.5 4.5 0 0 0 4-6l-4.5-7V3"/><path d="M7 15h10"/><path d="M10 18h.01M13.5 17h.01"/>',
        pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
        shout: '<path d="M4 9h3l5-4v14l-5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
        quill: '<path d="M20 3C12 4 7 9 5 17l2 0c1-2 3-3 5-3-1-1-1-2 0-3 2 0 3-1 4-2-1 0-2 0-2-1 3-1 5-3 6-5z"/><path d="M5 17l-2 4"/>',
        city: '<path d="M3 21V10l4-3 4 3v11"/><path d="M11 21V6l5-3 5 3v15"/><path d="M6 13h2M6 17h2M14 9h4M14 13h4M14 17h4"/>',
        cross: '<path d="M6 6l12 12M18 6L6 18"/>',
        cauldron: '<path d="M4 10h16"/><path d="M5 10c0 6 3 9 7 9s7-3 7-9"/><path d="M7 19l-1 2M17 19l1 2"/><path d="M9 7c-1-1.5 1-2.5 0-4M14 7c-1-1.5 1-2.5 0-4"/>',
        gem: '<path d="M6 4h12l3 5-9 12L3 9z"/><path d="M3 9h18M9 4l-1 5 4 12 4-12-1-5"/>',
        skull: '<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 2.5 5v3h9v-3c1.3-1 2.5-2.5 2.5-5a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="11" r="1.6"/><circle cx="14.7" cy="11" r="1.6"/><path d="M10 18v3M14 18v3M12 14v1.5"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
        snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>',
        heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
        pray: '<path d="M12 3v7"/><path d="M12 10l-3 5v6M12 10l3 5v6"/><path d="M9 6l3 4 3-4"/><circle cx="12" cy="12" r="10" stroke-dasharray="2 3"/>',
        wolf: '<path d="M4 4l4 5h8l4-5v9l-3 4-5 4-5-4-3-4z"/><path d="M9 13h.01M15 13h.01"/><path d="M10.5 17h3"/>',
        fang: '<path d="M4 6c2 1 14 1 16 0"/><path d="M4 6c0 5 3 9 8 9s8-4 8-9"/><path d="M8 9l1.5 6 1.5-6M13 9l1.5 6 1.5-6"/>',
        anvil: '<path d="M3 7h13c0 3 2 4 5 4H16l-2 3v3h3v3H6v-3h3v-3l-2-3c-2.5 0-4-1.5-4-4z"/>',
        pick: '<path d="M4 8c4-4 12-4 16 0"/><path d="M12 6v15"/>',
        fish: '<path d="M3 12c3-4 8-6 13-3l5-3v12l-5-3c-5 3-10 1-13-3z"/><circle cx="8" cy="11" r=".9"/>',
        meat: '<path d="M15 4a6 6 0 0 1 4 8l-6 6a5 5 0 0 1-7-7l6-6a5 5 0 0 1 3-1z"/><path d="M7 17l-3 3M3 18.5l2.5 2.5"/>',
        bread: '<path d="M4 12a8 5 0 0 1 16 0v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 10l1.5 3M12 9.5v3.5M16 10l-1.5 3"/>',
        house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
        crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>',
        moon: '<path d="M15 3a9 9 0 1 0 6 13 7.5 7.5 0 0 1-6-13z"/>',
        star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
        warn: '<path d="M12 3L2 20h20z"/><path d="M12 10v5M12 17.5v.01"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
        mountain: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M7.5 11l1.5 1.5L11 11"/>',
        chest: '<path d="M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10H3z"/><path d="M3 12h18"/><path d="M10.5 11h3v3h-3z"/>',
        boot: '<path d="M7 3h6v10l6 3a2 2 0 0 1 1 2v2H5V3z"/><path d="M5 17h15"/>',
        helm: '<path d="M5 13c0-4 3-7 7-7s7 3 7 7v3H5z"/><path d="M5 13c-2-1-3-4-2-7 1 2 2 3 4 4"/><path d="M19 13c2-1 3-4 2-7-1 2-2 3-4 4"/><path d="M12 6v10"/><path d="M8 16v3h8v-3"/>',
        glove: '<path d="M7 21v-5l-3-4a1.5 1.5 0 0 1 2.3-1.8L8 12V5a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v6V5a1.5 1.5 0 0 1 3 0v8c0 3-1 5-3 6v2z"/>',
        necklace: '<path d="M5 3c0 7 3 10 7 10s7-3 7-10"/><path d="M12 13l-2 3 2 4 2-4z"/>',
        sword: '<path d="M20 4l-1 4-9 9-2-2 9-9z"/><path d="M6 13l5 5M4 20l3-3"/>',
        axe: '<path d="M5 21L17 9"/><path d="M14 4c3 0 6 3 6 6l-3 1-4-4z"/>',
        cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9.5z"/>',
        drop: '<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
        blood: '<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z"/><path d="M8 14h8"/>',
        shroom: '<path d="M3 12a9 7 0 0 1 18 0z"/><path d="M10 12v7a2 2 0 0 0 4 0v-7"/><circle cx="8" cy="9" r=".8"/><circle cx="14" cy="7.5" r=".8"/>',
        mug: '<path d="M5 7h11v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M16 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/><path d="M5 7c0-2 2-3 3.5-2 1-1.5 4-1.5 5 0 1.5-1 2.5 0 2.5 2"/>',
        horse: '<path d="M7 21v-6l-3-2 3-7 5-3 2 3 5 1-1 3-4 1v10"/><path d="M10 7h.01"/>',
        spider: '<circle cx="12" cy="13" r="3.5"/><circle cx="12" cy="8" r="2"/><path d="M8.5 12L4 9V5M8.5 14L3 15M9 16l-4 4M15.5 12L20 9V5M15.5 14l5.5 1M15 16l4 4"/>'
    };
    var MAP = {
        '📖': 'book', '📘': 'tome', '📕': 'tome', '📚': 'book', '🔄': 'cycle', '🔁': 'cycle', '📜': 'scroll', '📍': 'pin', '📌': 'pin', '📅': 'calendar', '🗓': 'calendar',
        '🏪': 'shop', '🛒': 'basket', '🗺': 'map', '🎲': 'die', '⏭': 'next', '⏩': 'next', '💾': 'save', '📂': 'folder', '📁': 'folder', '➡': 'arrow',
        '⏳': 'hourglass', '⌛': 'hourglass', '⛺': 'tent', '🔮': 'orb', '✨': 'sparkle', '✋': 'hand', '🎯': 'target', '🤝': 'handshake', '🤫': 'hood', '🥷': 'hood',
        '🏹': 'bow', '💥': 'burst', '🪄': 'staff', '⚡': 'bolt', '🌿': 'herb', '🌱': 'herb', '🍃': 'herb', '🎣': 'rod', '😴': 'sleep', '💤': 'sleep', '🛏': 'sleep',
        '🔓': 'lock', '🔒': 'lock', '🔐': 'lock', '💰': 'purse', '🪙': 'purse', '🤏': 'pinch', '🎉': 'banner', '🎊': 'banner', '🚩': 'banner', '⚰': 'coffin', '⚖': 'scales',
        '🔍': 'search', '🔎': 'search', '📤': 'send', '📨': 'letter', '✉': 'letter', '📩': 'letter', '🧭': 'compass', '🗑': 'trash', '☁': 'cloud', '🕐': 'clock', '🕑': 'clock', '🕒': 'clock', '🕓': 'clock', '🕔': 'clock', '🕕': 'clock', '🕖': 'clock', '🕗': 'clock', '🕘': 'clock', '🕙': 'clock', '🕚': 'clock', '🕛': 'clock', '🕜': 'clock', '🕝': 'clock', '🕞': 'clock', '🕟': 'clock', '🕠': 'clock', '🕡': 'clock', '🕢': 'clock', '🕣': 'clock', '🕤': 'clock', '🕥': 'clock', '🕦': 'clock', '🕧': 'clock', '⏰': 'clock', '⏱': 'clock',
        '🛡': 'shield', '💍': 'ring', '🗡': 'dagger', '🔪': 'dagger', '🐾': 'paw', '👕': 'tunic', '🎽': 'tunic', '🥋': 'tunic', '📋': 'list', '📝': 'quill', '➕': 'plus',
        '🎒': 'satchel', '🏰': 'castle', '🏯': 'castle', '🔔': 'bell', '🔕': 'bellOff', '✅': 'check', '✔': 'check', '💬': 'speech', '🗨': 'speech',
        '🔧': 'hammer', '⚒': 'hammer', '🔨': 'hammer', '🛠': 'hammer', '🔥': 'flame', '📐': 'ruler', '🍽': 'bowl', '🍲': 'cauldron', '⚗': 'alembic', '🎤': 'lute', '🎵': 'lute', '🎶': 'lute',
        '🔑': 'key', '🗝': 'key', '👁': 'eye', '👀': 'eye', '🏘': 'village', '🏡': 'house', '🏠': 'house', '🎓': 'college', '📊': 'chart', '📈': 'chart', '⬆': 'up', '⬇': 'down',
        '⚔': 'swords', '🧪': 'potion', '🍷': 'potion', '⏸': 'pause', '🗣': 'shout', '📢': 'shout', '✍': 'quill', '🖋': 'quill', '🏙': 'city', '💎': 'gem', '💀': 'skull', '☠': 'skull',
        '☀': 'sun', '🌞': 'sun', '❄': 'snow', '🧊': 'snow', '❤': 'heart', '💖': 'heart', '🙏': 'pray', '🐺': 'wolf', '🧛': 'fang', '🦇': 'fang', '⛏': 'pick', '🐟': 'fish', '🐠': 'fish',
        '🍖': 'meat', '🥩': 'meat', '🍞': 'bread', '👑': 'crown', '🌙': 'moon', '🌕': 'moon', '⭐': 'star', '🌟': 'star', '⚠': 'warn', 'ℹ': 'info', '🏔': 'mountain', '⛰': 'mountain',
        '📦': 'chest', '🧰': 'chest', '🥾': 'boot', '👢': 'boot', '⛑': 'helm', '🪖': 'helm', '🧤': 'glove', '📿': 'necklace', '🪓': 'axe', '🏛': 'castle', '🧙': 'staff', '🪨': 'mountain', '🔷': 'drop', '💧': 'drop', '🩸': 'blood', '🍄': 'shroom', '🧀': 'bread', '🍺': 'mug', '🍻': 'mug', '🐴': 'horse', '🐎': 'horse', '🕷': 'spider', '🐀': 'paw', '🐕': 'paw', '🐶': 'paw'
    };
    function svg(key) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + P[key] + '</svg>';
    }
    window.stDrawnIcon = function (key) { return P[key] ? svg(key) : ''; };
    // одно эмодзи с необязательным селектором варианта (FE0F)
    var RE = new RegExp('(' + Object.keys(MAP).map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).sort(function (a, b) { return b.length - a.length; }).join('|') + ')️?', 'g');
    var SKIP = 'input, textarea, select, option, script, style, svg, .sk-ic, #st-hub, [contenteditable="true"]';

    function swapText(node) {
        var v = node.nodeValue; RE.lastIndex = 0;
        if (!v || !RE.test(v)) return;
        RE.lastIndex = 0;
        var frag = document.createDocumentFragment(), last = 0, m;
        while ((m = RE.exec(v))) {
            if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
            var span = document.createElement('span'); span.className = 'sk-ic'; span.setAttribute('data-k', MAP[m[1]]);
            span.innerHTML = svg(MAP[m[1]]) + '<span class="sk-ic-t"></span>';
            span.lastChild.textContent = m[0];
            frag.appendChild(span);
            last = m.index + m[0].length;
        }
        if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
        node.parentNode.replaceChild(frag, node);
    }
    function processEl(el) {
        if (!el || el.nodeType !== 1 || el.closest(SKIP)) return;
        // весь текст внутри элемента, кроме полей ввода, списков выбора, скриптов и уже нарисованных иконок
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) { var p = n.parentNode; return p && p.closest && !p.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
        });
        var list = [], n; while ((n = walker.nextNode())) list.push(n);
        list.forEach(swapText);
    }
    function scan(root) { if (root && root.nodeType === 1) processEl(root); }
    window.stIconScan = scan;

    var pending = new Set(), raf = 0;
    function flush() { raf = 0; var arr = Array.from(pending); pending.clear(); arr.forEach(function (r) { if (r.isConnected) scan(r); }); }
    var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
            var t = m.type === 'characterData' ? m.target.parentNode : m.target;
            if (!t || t.nodeType !== 1 || (t.closest && t.closest('.sk-ic'))) return;
            pending.add(t);
        });
        if (pending.size && !raf) raf = requestAnimationFrame(flush);
    });
    function start() {
        scan(document.body);
        mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
