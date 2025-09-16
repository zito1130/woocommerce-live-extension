// (onClicked 監聽器和 checkDuplicateCallNumber 輔助函式不變)
chrome.action.onClicked.addListener((tab) => {
  try {
    chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) { console.error("無法打開側邊欄:", error); }
});

async function checkDuplicateCallNumber(settings, productData, productIdToExclude = null) {
    if (!productData.callNumber || productData.callNumber.length === 0) return;
    let searchUrl = `${settings.storeUrl}/wp-json/wc/v3/products?category=${settings.defaultCategoryId}`;
    if (!settings.defaultCategoryId) throw new Error('請先設定預設分類以檢查 Call號！');
    const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
    const searchResponse = await fetch(searchUrl, { method: 'GET', headers: { 'Authorization': authHeader } });
    const existingProducts = await searchResponse.json();
    if (!searchResponse.ok) throw new Error('查詢商品失敗');
    for (const product of existingProducts) {
        if (product.id === productIdToExclude) continue;
        const found = product.meta_data.find(meta => meta.key === 'call_number' && meta.value === productData.callNumber);
        if (found) throw new Error(`Call號 "${productData.callNumber}" 已存在！`);
    }
}

// --- 主要監聽器 ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // (getSignedUrl, getProducts, createProduct, updateProduct, batchUpdateProducts 動作不變)
    if (request.action === 'getSignedUrl') {
        chrome.storage.sync.get(['eulerstreamKey', 'tiktokUsername'], (settings) => {
            if (chrome.runtime.lastError || !settings.tiktokUsername || !settings.eulerstreamKey) {
                return sendResponse({ success: false, error: '金鑰或主播帳號未設定。' });
            }
            const uniqueId = settings.tiktokUsername.replace('@', '');
            const apiKey = settings.eulerstreamKey;
            const websocketUrl = `wss://ws.eulerstream.com?uniqueId=${uniqueId}&apiKey=${apiKey}`;
            sendResponse({ success: true, data: { signedUrl: websocketUrl } });
        });
        return true;
    }
    if (request.action === 'getProducts') {
        chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId'], async (settings) => {
            if (!settings.storeUrl || !settings.consumerKey || !settings.consumerSecret) {
                return sendResponse({ success: false, error: '商店設定不完整。' });
            }
            if (!settings.defaultCategoryId) {
                return sendResponse({ success: true, data: [] });
            }
            try {
                const apiUrl = `${settings.storeUrl}/wp-json/wc/v3/products?category=${settings.defaultCategoryId}`;
                const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
                const response = await fetch(apiUrl, { method: 'GET', headers: { 'Authorization': authHeader } });
                const products = await response.json();
                if (!response.ok) throw new Error('獲取商品列表失敗');
                sendResponse({ success: true, data: products });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        });
        return true;
    }
    if (request.action === 'createProduct') {
        chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId'], async (settings) => {
            const productData = request.data;
            try {
                await checkDuplicateCallNumber(settings, productData);
                const createUrl = `${settings.storeUrl}/wp-json/wc/v3/products`;
                const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
                const bodyPayload = {
                    name: productData.name, type: 'simple', regular_price: productData.price,
                    description: productData.description || '',
                    manage_stock: true, stock_quantity: productData.qty,
                    categories: settings.defaultCategoryId ? [{ id: parseInt(settings.defaultCategoryId, 10) }] : [],
                    meta_data: [], shipping_class: productData.shippingClassSlug || ""
                };
                if (productData.callNumber) {
                    bodyPayload.meta_data.push({ key: 'call_number', value: productData.callNumber });
                }
                const createResponse = await fetch(createUrl, {
                    method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload)
                });
                const newProduct = await createResponse.json();
                if (!createResponse.ok) throw new Error(newProduct.message || '建立商品失敗');
                sendResponse({ success: true, data: newProduct });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        });
        return true;
    }
    if (request.action === 'updateProduct') {
        chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId'], async (settings) => {
            const { productId, data } = request;
            const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
            try {
                if (data.callNumber !== undefined) {
                    await checkDuplicateCallNumber(settings, data, productId);
                }
                const updateUrl = `${settings.storeUrl}/wp-json/wc/v3/products/${productId}`;
                const bodyPayload = {};
                if (data.price !== undefined) bodyPayload.regular_price = data.price;
                if (data.qty !== undefined) bodyPayload.stock_quantity = data.qty;
                if (data.callNumber !== undefined) bodyPayload.meta_data = [{ key: 'call_number', value: data.callNumber }];
                if (data.status !== undefined) bodyPayload.status = data.status;
                if (data.description !== undefined) bodyPayload.description = data.description;
                if (Object.keys(bodyPayload).length === 0) {
                    return sendResponse({ success: true, data: { id: productId } });
                }
                const updateResponse = await fetch(updateUrl, {
                    method: 'PUT', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload)
                });
                const updatedProduct = await updateResponse.json();
                if (!updateResponse.ok) throw new Error(updatedProduct.message || '更新商品失敗');
                sendResponse({ success: true, data: updatedProduct });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        });
        return true;
    }
    if (request.action === 'batchUpdateProducts') {
        chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret'], async (settings) => {
            const { operation, productIds } = request.data;
            const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
            const batchUrl = `${settings.storeUrl}/wp-json/wc/v3/products/batch`;
            let payload = {};
            if (operation === 'publishAll') {
                payload.update = productIds.map(id => ({ id, status: 'publish' }));
            } else if (operation === 'unpublishAll') {
                payload.update = productIds.map(id => ({ id, status: 'draft' }));
            } else if (operation === 'clearCallNumbers') {
                payload.update = productIds.map(id => ({
                    id,
                    meta_data: [{ key: 'call_number', value: '' }]
                }));
            }
            try {
                const response = await fetch(batchUrl, {
                    method: 'POST',
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const responseData = await response.json();
                if (!response.ok) throw new Error(responseData.message || '批次更新失敗');
                sendResponse({ success: true, data: responseData });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        });
        return true;
    }
    
    // ***【新功能】*** 動作六：加入到指定用戶的購物車
    if (request.action === 'addToCart') {
        chrome.storage.sync.get(['storeUrl'], async (settings) => {
            if (!settings.storeUrl) {
                return sendResponse({ success: false, error: '商店網址未設定。' });
            }

            // !! 重要：這裡的密鑰必須和您在 PHP 插件中設定的完全一樣
            const secretKey = '7732DDB4F15A5'; 

            const apiUrl = `${settings.storeUrl}/wp-json/livestream/v1/add-to-cart`;
            const payload = request.data;

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Livestream-Secret': secretKey // 加上我們自訂的驗證標頭
                    },
                    body: JSON.stringify(payload)
                });

                const responseData = await response.json();
                if (!response.ok) {
                    throw new Error(responseData.message || `HTTP 錯誤: ${response.status}`);
                }
                
                sendResponse({ success: true, data: responseData });

            } catch (error) {
                console.error('加入購物車 API 呼叫失敗:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true;
    }
});