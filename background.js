// 功能一：當使用者點擊右上角的擴充功能圖示時，打開側邊面板
chrome.action.onClicked.addListener((tab) => {
  try {
    chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error("無法打開側邊欄:", error);
  }
});

// 功能二：監聽來自 side_panel.js 的所有訊息請求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSignedUrl') {
        // (此部分程式碼不變)
        chrome.storage.sync.get(['eulerstreamKey', 'tiktokUsername'], (settings) => {
            if (chrome.runtime.lastError) {
                return sendResponse({ success: false, error: '無法讀取擴充功能設定。' });
            }
            if (!settings.tiktokUsername || !settings.eulerstreamKey) {
                return sendResponse({ success: false, error: '請先在「商店設定」中填寫您的 Eulerstream 金鑰和主播帳號！' });
            }
            const uniqueId = settings.tiktokUsername.replace('@', '');
            const apiKey = settings.eulerstreamKey;
            const websocketUrl = `wss://ws.eulerstream.com?uniqueId=${uniqueId}&apiKey=${apiKey}`;
            sendResponse({ success: true, data: { signedUrl: websocketUrl } });
        });
        return true;
    }

    if (request.action === 'createProduct') {
        chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId'], async (settings) => {
            if (!settings.storeUrl || !settings.consumerKey || !settings.consumerSecret) {
                return sendResponse({ success: false, error: '商店設定不完整，請檢查設定頁面。' });
            }

            const productData = request.data;
            const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
            
            try {
                // (Call號檢查邏輯不變)
                if (productData.callNumber && productData.callNumber.length > 0) {
                    let searchUrl = `${settings.storeUrl}/wp-json/wc/v3/products`;
                    if (settings.defaultCategoryId) {
                        searchUrl += `?category=${settings.defaultCategoryId}`;
                    } else {
                        throw new Error('請先在「商品設置」中設定一個預設分類以檢查 Call號！');
                    }
                    const searchResponse = await fetch(searchUrl, { method: 'GET', headers: { 'Authorization': authHeader } });
                    const existingProducts = await searchResponse.json();
                    if (!searchResponse.ok) throw new Error('查詢商品失敗，請檢查網路或商店設定。');
                    for (const product of existingProducts) {
                        const found = product.meta_data.find(meta => meta.key === 'call_number' && meta.value === productData.callNumber);
                        if (found) throw new Error(`Call號 "${productData.callNumber}" 在此分類中已存在！`);
                    }
                }

                const createUrl = `${settings.storeUrl}/wp-json/wc/v3/products`;
                const bodyPayload = {
                    name: productData.name,
                    type: 'simple',
                    regular_price: productData.price,
                    manage_stock: true,
                    stock_quantity: productData.qty,
                    categories: settings.defaultCategoryId ? [{ id: parseInt(settings.defaultCategoryId, 10) }] : [],
                    meta_data: []
                };

                if (productData.callNumber && productData.callNumber.length > 0) {
                    bodyPayload.meta_data.push({
                        key: 'call_number',
                        value: productData.callNumber
                    });
                }
                
                // ***【修改】***
                // 檢查 shippingClassSlug 是否為一個有效的、非空的字串
                if (productData.shippingClassSlug && productData.shippingClassSlug.length > 0) {
                    // 使用 shipping_class 欄位並傳入 slug 字串
                    bodyPayload.shipping_class = productData.shippingClassSlug;
                }
                // ***【修改結束】***

                const createResponse = await fetch(createUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bodyPayload)
                });

                const newProduct = await createResponse.json();
                if (!createResponse.ok) {
                    throw new Error(newProduct.message || `HTTP 錯誤: ${createResponse.status}`);
                }
                
                sendResponse({ success: true, data: newProduct });

            } catch (error) {
                console.error('上架商品時發生錯誤:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true;
    }
});