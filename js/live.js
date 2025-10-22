// js/live.js (v41.0 - 採用使用者建議的效能優化方案)
import { elements } from './constants.js';
import { showToast } from './ui.js';
import { api } from './api.js';
// 【*** 關鍵修正 1 ***】
// 直接從 product.js 模組導入獲取列表的函式
import { getProductListData, renderProducts } from './product.js';

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

// 【*** 關鍵修正 2 ***】
// 函式不再需要接收任何參數，因為它可以直接從導入的模組獲取所需的一切
function setupWebSocketListeners() {
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
                // 【*** 關鍵修正 3 ***】
                // 在每次收到留言時，都呼叫 getProductListData() 來獲取最新的商品列表
                // 這是在記憶體中讀取，沒有效能問題
                const currentProductList = getProductListData();

                const matchedProduct = currentProductList.find(p => 
                    p.status === 'publish' && p.meta_data.find(m => m.key === 'call_number')?.value.toLowerCase() === order.callNumber.toLowerCase()
                );
                if (matchedProduct) {
                    handleAddToCart({ nickname, uniqueId }, matchedProduct, order.quantity);
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

async function handleAddToCart(customerInfo, productInfo, quantity) {
    if (productInfo.stock_quantity < quantity) {
        return showToast(`⚠️ ${customerInfo.nickname} 下單失敗，庫存不足！`, 'error');
    }
    try {
        await api.addToCart({
            uniqueId: customerInfo.uniqueId,
            productId: productInfo.id,
            quantity: quantity
        });

        // 直接從最新的列表中找到商品並更新庫存
        const productListData = getProductListData();
        const productToUpdate = productListData.find(p => p.id === productInfo.id);
        if (productToUpdate) {
            productToUpdate.stock_quantity -= quantity;
            // 直接呼叫 renderProducts 來重新渲染畫面
            renderProducts();
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

async function startLive() {
    if (elements.liveTitleInput.value.length < 9) {
        return showToast('❌ 標題格式不正確 (YYMMDD-SS)', 'error');
    }
    showToast('🔑 正在請求連線...', 'loading');
    try {
        const { signedUrl } = await api.getSignedUrl();
        showToast('📡 驗證成功，正在連接...', 'loading');
        websocket = new WebSocket(signedUrl);
        // 【*** 關鍵修正 4 ***】
        // 函式不再需要傳遞任何參數
        setupWebSocketListeners();
    } catch (err) {
        showToast(`❌ 連線失敗: ${err.message}`, 'error');
    }
}

export function initializeLiveControls() {
    elements.startLiveButton.addEventListener('click', startLive);

    elements.pauseResumeButton.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            if (websocket) websocket.close();
            showToast('⏸️ 直播已暫停。', 'info');
            elements.pauseResumeButton.textContent = '恢復直播';
        } else {
            startLive();
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
    });
}