import time
from playwright.sync_api import sync_playwright

def verify_killfeed():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Wait for game to load
        page.wait_for_selector("#start-btn")
        page.click("#start-btn")

        # Wait for start screen to be hidden
        page.wait_for_selector("#start-screen", state="hidden")

        # Inject Mock Kill Messages matching the expected DOM structure
        page.evaluate("""
            const killFeed = document.getElementById('kill-feed');

            function createMsg(killerId, killerName, victimId, victimName, weaponName, isHeadshot, myId) {
                const msg = document.createElement('div');
                msg.className = 'kill-msg';

                // Border Styling
                if (killerId === myId) {
                    msg.classList.add('kill-border-green');
                } else {
                    msg.classList.add('kill-border-red');
                }

                const createNameSpan = (id, name, isMe) => {
                    const span = document.createElement('span');
                    span.innerText = isMe ? "You" : (name || id.substring(0, 5));
                    span.className = isMe ? 'text-green' : 'text-red';
                    return span;
                };

                const killerSpan = createNameSpan(killerId, killerName, killerId === myId);
                const victimSpan = createNameSpan(victimId, victimName, victimId === myId);

                const weaponSpan = document.createElement('span');
                weaponSpan.className = 'weapon-name';
                weaponSpan.innerText = weaponName;

                msg.appendChild(killerSpan);
                msg.appendChild(weaponSpan);

                // Headshot Icon
                if (isHeadshot) {
                    const icon = document.createElement('img');
                    icon.src = 'assets/skull.png';
                    icon.className = 'kill-icon';
                    msg.appendChild(icon);
                }

                msg.appendChild(victimSpan);

                killFeed.appendChild(msg);
            }

            const myId = 'me';

            // 1. You killed Enemy (HS)
            createMsg('me', 'You', 'e1', 'Enemy1', 'AK-47', true, myId);

            // 2. You killed Enemy (Body)
            createMsg('me', 'You', 'e2', 'Enemy2', 'Sniper', false, myId);

            // 3. Enemy killed You (HS)
            createMsg('e1', 'Enemy1', 'me', 'You', 'Knife', true, myId);

            // 4. Enemy killed Enemy (HS)
            createMsg('e3', 'Enemy3', 'e4', 'Enemy4', 'Revolver', true, myId);
        """)

        time.sleep(1)
        page.screenshot(path="verification/killfeed_ui_test.png")
        print("Screenshot saved to verification/killfeed_ui_test.png")
        browser.close()

if __name__ == "__main__":
    verify_killfeed()
