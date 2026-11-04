# İki oyunculu tarayıcı testi: giriş → lobi → oda → koltuk → Uno → hediye
import sys, time
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3001'
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots') + '/'
os.makedirs(OUT, exist_ok=True)
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    def player(name, av_index):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(f'{name}: {m.text}'))
        pg.on('pageerror', lambda e: errors.append(f'{name} PAGEERROR: {e}'))
        pg.goto(URL)
        pg.wait_for_selector('.login-card')
        pg.locator('.avatar-grid button').nth(av_index).click()
        pg.fill('input[placeholder="Kullanıcı adı"]', name)
        return pg
    a = player('Ayse', 4)
    a.screenshot(path=OUT + '1_login.png')
    a.click('text=Partiye katıl')
    a.wait_for_selector('.room-card')
    time.sleep(0.5)
    a.screenshot(path=OUT + '2_home.png')
    # günlük ödül
    a.click('.tabbar button:nth-child(3)'); a.wait_for_selector('.daily')
    a.click('text=Topla'); time.sleep(0.4)
    a.screenshot(path=OUT + '3_profile.png')
    a.click('.tabbar button:nth-child(1)')

    bb = player('Burak', 5)
    bb.click('text=Partiye katıl'); bb.wait_for_selector('.room-card')

    for pg in (a, bb):
        pg.click('.room-card:has-text("Uno Masası")'); pg.wait_for_selector('.seats')
    a.locator('.seat').nth(0).click(); time.sleep(0.3)
    bb.locator('.seat').nth(1).click(); time.sleep(0.3)
    a.fill('.room-bar input', 'Selam herkese!'); a.press('.room-bar input', 'Enter'); time.sleep(0.4)
    a.screenshot(path=OUT + '4_room.png')
    a.click('text=Oyunu başlat'); a.wait_for_selector('.uno-table'); bb.wait_for_selector('.uno-table')
    time.sleep(0.8)
    # sırası gelen oyuncu oynanabilir kart varsa oynar
    for _ in range(6):
        for pg in (a, bb):
            if pg.locator('.uno-table.my-turn').count():
                card = pg.locator('.hand .uno-card.playable').first
                if card.count():
                    card.click(); time.sleep(0.3)
                    if pg.locator('.color-pick').count(): pg.locator('.colors button').first.click()
                else:
                    pg.click('.deck'); time.sleep(0.3)
                    if pg.locator('text=Pas').count(): pg.click('text=Pas')
                time.sleep(0.5)
    a.screenshot(path=OUT + '5_uno_a.png'); bb.screenshot(path=OUT + '6_uno_b.png')
    # büyük hediye: Spor Araba (520 💎)
    a.click('.gift-btn'); a.wait_for_selector('.gift-grid'); time.sleep(0.3)
    a.click('.gift:has-text("Spor Araba")')
    a.screenshot(path=OUT + '7_giftsheet.png')
    a.click('.gift-foot .btn.gold'); time.sleep(0.9)
    bb.screenshot(path=OUT + '8_giftfx.png')
    a.click('.gift-btn'); a.wait_for_selector('.gift-grid'); a.click('.gift:has-text("Gül")'); a.click('.qty button:has-text("×10")')
    a.click('.gift-foot .btn.gold'); a.mouse.click(200, 100); time.sleep(0.7)
    bb.screenshot(path=OUT + '9_giftsmall.png')
    b.close()
print('HATALAR:', errors if errors else 'yok')
