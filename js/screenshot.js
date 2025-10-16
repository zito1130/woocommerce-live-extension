// woocommerce-extension/js/screenshot.js (修正後版本)
import { elements } from './constants.js';
import { showToast } from './ui.js';
import { api } from './api.js';

function cropImageByCoords(base64DataUrl, rect, scale = 1.0) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const dpr = rect.devicePixelRatio || 1;
            const rectW = rect.width * dpr;
            const rectH = rect.height * dpr;
            const rectX = rect.x * dpr;
            const rectY = rect.y * dpr;
            const maxSideLength = Math.min(rectW, rectH);
            if (maxSideLength <= 0) return reject(new Error('裁切範圍無效'));
            const finalSideLength = maxSideLength * scale;
            const sx = (rectX + rectW / 2) - finalSideLength / 2;
            const sy = (rectY + rectH / 2) - finalSideLength / 2;
            const canvas = document.createElement('canvas');
            canvas.width = finalSideLength;
            canvas.height = finalSideLength;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, finalSideLength, finalSideLength, 0, 0, finalSideLength, finalSideLength);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => reject(new Error('無法載入截圖。'));
        img.src = base64DataUrl;
    });
}

export async function takeAndPreviewScreenshot() {
    showToast('📸 準備截圖... 3秒後開始！', 'info', 3500);
    
    // 【*** 關鍵修正 1 ***】
    // 在開始任何動作之前，先手動發送 "隱藏" 指令，確保預覽框不會被拍到。
    await sendPreviewCommand('hide');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const selector = elements.screenshotSelectorInput.value.trim();
        const scaleValue = parseInt(elements.screenshotScaleInput.value, 10) / 100;

        if (!tab || !tab.id) throw new Error("無法獲取分頁 ID。");
        if (!selector) throw new Error('請先在「商品設置」中指定截圖的 CSS 選擇器。');

        const response = await api.takeScreenshot(tab.id, selector);
        const croppedDataUrl = await cropImageByCoords(response.fullScreenshot, response.rect, scaleValue);
        
        elements.screenshotPreview.src = croppedDataUrl;
        elements.screenshotPreview.classList.remove('hidden');
        showToast('✅ 截圖成功！', 'success');
        return croppedDataUrl; // Return for onMarket button
    } catch (error) {
        showToast(`❌ 截圖失敗: ${error.message}`, 'error');
        throw error; // Re-throw to be caught by caller
    } finally {
        // 【*** 關鍵修正 2 ***】
        // 無論截圖成功或失敗，最後都呼叫 updatePreviewVisibility()。
        // 這個函式會檢查 Toggle 開關的狀態，如果開關是打開的，它會自動重新顯示預覽框。
        updatePreviewVisibility();
    }
}

async function sendPreviewCommand(action) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id || tab.url.startsWith('chrome://')) return;

        // 確保 content_script 已注入
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content_script.js'] });

        if (action === 'update') {
            const selector = elements.screenshotSelectorInput.value.trim();
            const scale = parseInt(elements.screenshotScaleInput.value, 10) / 100;
            const message = (!selector || isNaN(scale) || scale <= 0)
                ? { action: 'hidePreview' }
                : { action: 'updatePreview', selector, scale };
            await chrome.tabs.sendMessage(tab.id, message);
        } else if (action === 'hide') {
            await chrome.tabs.sendMessage(tab.id, { action: 'hidePreview' });
        }
    } catch (error) {
        if (!error.message.includes('Receiving end does not exist')) {
             console.warn('發送預覽指令失敗:', error.message);
        }
    }
}

function updatePreviewVisibility() {
    const currentTab = document.querySelector('.tab-button.active')?.dataset.tab;
    const isPreviewTabActive = (currentTab === 'live' || currentTab === 'products');
    if (elements.livePreviewToggle.checked && isPreviewTabActive) {
        sendPreviewCommand('update');
    } else {
        sendPreviewCommand('hide');
    }
}

export function initializeScreenshotAndPreview() {
    elements.screenshotButton.addEventListener('click', takeAndPreviewScreenshot);
    elements.livePreviewToggle.addEventListener('change', () => {
        updatePreviewVisibility();
        chrome.storage.sync.set({ livePreviewEnabled: elements.livePreviewToggle.checked });
    });
    elements.screenshotSelectorInput.addEventListener('input', updatePreviewVisibility);
    elements.screenshotScaleInput.addEventListener('input', updatePreviewVisibility);
    
    window.addEventListener('unload', () => sendPreviewCommand('hide'));

    return { updatePreviewVisibility };
}