// woocommerce-extension/content_script.js (修正後版本)

let cropPreviewOverlay = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updatePreview') {
        showCropArea(request.selector, request.scale);
        sendResponse({ success: true });

    } else if (request.action === 'hidePreview') {
        hideCropArea();
        sendResponse({ success: true });

    } else if (request.action === 'startCountdownOnPage') {
        // 【*** 關鍵修正 ***】
        // 移除 hideCropArea(); 這一行。
        // 現在是否隱藏預覽框完全由側邊欄面板在截圖前後決定。
        createAndStartCountdown();
        sendResponse({ success: true });
        
    } else if (request.action === 'getElementRect') {
        try {
            const element = document.querySelector(request.selector);
            if (!element) {
                sendResponse({ success: false, error: `在頁面上找不到選擇器 "${request.selector}"` });
                return;
            }
            const rect = element.getBoundingClientRect();
            sendResponse({
                success: true,
                data: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, devicePixelRatio: window.devicePixelRatio }
            });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    }
    return true; // 保持異步訊息通道開啟
});

function hideCropArea() {
    if (cropPreviewOverlay && cropPreviewOverlay.parentNode) {
        cropPreviewOverlay.parentNode.removeChild(cropPreviewOverlay);
        cropPreviewOverlay = null;
    }
}

function showCropArea(selector, scale = 1.0) {
    hideCropArea(); // 先移除舊的，再顯示新的

    const element = document.querySelector(selector);
    if (!element) return; // 找不到元素就不顯示

    const rect = element.getBoundingClientRect();
    const maxSideLength = Math.min(rect.width, rect.height);
    const finalSideLength = maxSideLength * scale;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const finalLeft = centerX - finalSideLength / 2;
    const finalTop = centerY - finalSideLength / 2;

    cropPreviewOverlay = document.createElement('div');
    cropPreviewOverlay.id = 'livestream-crop-preview-overlay';
    cropPreviewOverlay.style.left = `${finalLeft}px`;
    cropPreviewOverlay.style.top = `${finalTop}px`;
    cropPreviewOverlay.style.width = `${finalSideLength}px`;
    cropPreviewOverlay.style.height = `${finalSideLength}px`;

    document.body.appendChild(cropPreviewOverlay);
}

function createAndStartCountdown() {
    if (document.getElementById('livestream-countdown-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'livestream-countdown-overlay';
    const numberSpan = document.createElement('span');
    numberSpan.id = 'livestream-countdown-number';
    overlay.appendChild(numberSpan);
    document.body.appendChild(overlay);

    let count = 3;
    numberSpan.textContent = count;
    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            numberSpan.textContent = count;
        } else {
            clearInterval(countdownInterval);
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }
    }, 1000);
}