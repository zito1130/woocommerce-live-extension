// js/live.js
import { elements } from './constants.js';
import { showToast } from './ui.js';
import { api } from './api.js';

let websocket = null;
let isLive = false;
let isPaused = false;
const MAX_COMMENTS_IN_LIST = 500;

function parseOrderComment(comment) {
    const match = comment.trim().match(/^([A-Za-z0-9]+)(?:\+(\d+))?$/);
    if (!match) return null;
    return {
        callNumber: match[1],
        quantity: match[2] ? parseInt(match[2], 10) : 1
    };
}

function setupWebSocketListeners(productListData, renderProductsFunc) {
    if (!websocket) return;

    websocket.onopen = () => {
        isLive = true; isPaused = false;
        showToast('✅ 已連接！正在監控留言...', 'success');
        elements.liveTitleInput.disabled = true;
        elements.startLiveButton.classList.add('hidden');
        elements.liveControlsDiv.classList.remove('hidden');
        elements.pauseResumeButton.textContent = '暫停直播';
    };

    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        data.messages?.forEach(msg => {
            const { comment, user } = msg.data || {};
            if (!comment || !user) return;
            
            const { nickname, uniqueId } = user;
            const order = parseOrderComment(comment);
            
            if (order && uniqueId) {
                const matchedProduct = productListData.find(p => 
                    p.status === 'publish' && p.meta_data.find(m => m.key === 'call_number')?.value.toLowerCase() === order.callNumber.toLowerCase()
                );
                if (matchedProduct) {
                    handleAddToCart({ nickname, uniqueId }, matchedProduct, order.quantity, productListData, renderProductsFunc);
                    logMessage(elements.orderLogListDiv, `[ ${uniqueId} ] ${nickname}: ${comment}`);
                }
            }
            logMessage(elements.commentListDiv, `<b>${nickname || '用戶'}</b>: ${comment}`);
        });
    };

    websocket.onclose = (event) => {
        if (isLive) showToast(`🔌 連線已中斷。Code: ${event.code}`, 'error');
    };
    websocket.onerror = () => {
        if (isLive && !isPaused) showToast('❌ 連線發生嚴重錯誤', 'error');
    };
}

async function handleAddToCart(customerInfo, productInfo, quantity, productListData, renderProductsFunc) {
    if (productInfo.stock_quantity < quantity) {
        return showToast(`⚠️ ${customerInfo.nickname} 下單失敗，庫存不足！`, 'error');
    }
    try {
        await api.addToCart({
            uniqueId: customerInfo.uniqueId,
            productId: productInfo.id,
            quantity: quantity
        });
        const productToUpdate = productListData.find(p => p.id === productInfo.id);
        if (productToUpdate) {
            productToUpdate.stock_quantity -= quantity;
            renderProductsFunc(productListData);
        }
    } catch (error) {
        showToast(`❌ 操作失敗: ${error.message}`, 'error');
    }
}

function logMessage(container, htmlContent) {
    const item = document.createElement('div');
    item.className = container === elements.orderLogListDiv ? 'order-log-item' : 'comment-item';
    item.innerHTML = htmlContent;
    container.appendChild(item);
    while (container.children.length > MAX_COMMENTS_IN_LIST) {
        container.removeChild(container.firstChild);
    }
    container.scrollTop = container.scrollHeight;
}

async function startLive(productListData, renderProductsFunc) {
    if (elements.liveTitleInput.value.length < 9) {
        return showToast('❌ 標題格式不正確 (YYMMDD-SS)', 'error');
    }
    showToast('🔑 正在請求連線...', 'loading');
    try {
        const { signedUrl } = await api.getSignedUrl();
        showToast('📡 驗證成功，正在連接...', 'loading');
        websocket = new WebSocket(signedUrl);
        setupWebSocketListeners(productListData, renderProductsFunc);
    } catch (err) {
        showToast(`❌ 連線失敗: ${err.message}`, 'error');
    }
}

export function initializeLiveControls(getProductListData, renderProductsFunc) {
    elements.startLiveButton.addEventListener('click', () => {
        const productListData = getProductListData();
        startLive(productListData, renderProductsFunc);
    });

    elements.pauseResumeButton.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            if (websocket) websocket.close();
            showToast('⏸️ 直播已暫停。', 'info');
            elements.pauseResumeButton.textContent = '恢復直播';
        } else {
            const productListData = getProductListData();
            startLive(productListData, renderProductsFunc);
        }
    });

    elements.endLiveButton.addEventListener('click', () => {
        if (websocket) websocket.close();
        websocket = null; isLive = false; isPaused = false;
        showToast(`⏹️ 直播 "${elements.liveTitleInput.value}" 已結束。`, 'info');
        elements.liveTitleInput.disabled = false;
        elements.liveControlsDiv.classList.add('hidden');
        elements.startLiveButton.classList.remove('hidden');
        elements.pauseResumeButton.textContent = '暫停直播';
        elements.commentListDiv.innerHTML = '';
        elements.orderLogListDiv.innerHTML = '';
        elements.liveTitleInput.value = suggestLiveTitle();
    });
}