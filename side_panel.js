// woocommerce-extension/side_panel.js (完整替換)

document.addEventListener('DOMContentLoaded', () => {
    // --- 元素宣告和狀態變數 (保持不變) ---
    const productsListDiv = document.getElementById('productsList');
    const modal = document.getElementById('editProductModal');
    const modalProductName = document.getElementById('modalProductName');
    const modalProductQty = document.getElementById('modalProductQty');
    const modalProductPrice = document.getElementById('modalProductPrice');
    const modalProductCall = document.getElementById('modalProductCall');
    const modalUpdateButton = document.getElementById('modalUpdateButton');
    const modalCancelButton = document.getElementById('modalCancelButton');
    const modalStatus = document.getElementById('modalStatus');
    const modalUpdateTimeButton = document.getElementById('modalUpdateTimeButton');
    const publishAllBtn = document.getElementById('publishAllBtn');
    const unpublishAllBtn = document.getElementById('unpublishAllBtn');
    const clearCallNumbersBtn = document.getElementById('clearCallNumbersBtn');
    const commentListDiv = document.getElementById('comment-list');
    const orderLogListDiv = document.getElementById('order-log-list');
    const liveTitleInput = document.getElementById('liveTitle');
    const startLiveButton = document.getElementById('startLiveButton');
    const liveControlsDiv = document.getElementById('liveControls');
    const pauseResumeButton = document.getElementById('pauseResumeButton');
    const endLiveButton = document.getElementById('endLiveButton');
    const currentTiktokUserDisplay = document.getElementById('currentTiktokUserDisplay');
    const storeUrlInput = document.getElementById('storeUrl');
    const consumerKeyInput = document.getElementById('consumerKey');
    const consumerSecretInput = document.getElementById('consumerSecret');
    const eulerstreamKeyInput = document.getElementById('eulerstreamKey');
    const tiktokUsernameInput = document.getElementById('tiktokUsername');
    const saveButton = document.getElementById('saveButton');
    const testButton = document.getElementById('testButton');
    const statusDiv = document.getElementById('status');
    const categorySelector = document.getElementById('categorySelector');
    const saveCategoryButton = document.getElementById('saveCategoryButton');
    const categoryStatusDiv = document.getElementById('categoryStatus');
    const currentCategoryDisplay = document.getElementById('currentCategoryDisplay');
    const supplierSelector = document.getElementById('supplierSelector');
    const saveSupplierButton = document.getElementById('saveSupplierButton');
    const supplierStatusDiv = document.getElementById('supplierStatus');
    const currentSupplierDisplay = document.getElementById('currentSupplierDisplay');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const productNameInput = document.getElementById('productName');
    const productQtyInput = document.getElementById('productQty');
    const productPriceInput = document.getElementById('productPrice');
    const productCallInput = document.getElementById('productCall');
    const onMarketButton = document.getElementById('onMarketButton');
    const shippingClassSelector = document.getElementById('shippingClassSelector');
    const screenshotButton = document.getElementById('screenshotButton');
    const screenshotPreview = document.getElementById('screenshotPreview');
    const screenshotSelectorInput = document.getElementById('screenshotSelector');
    const screenshotScaleInput = document.getElementById('screenshotScale');
    const livePreviewToggle = document.getElementById('livePreviewToggle');

    let currentEditingProductId = null;
    let productListData = [];
    let isLive = false;
    let isPaused = false;
    let websocket = null;
    let categoriesCache = null;
    let lastFetchTimestamp = 0;
    const MAX_COMMENTS_IN_LIST = 500;
    
    // side_panel.js (修正為可縮放的正方形裁切)
    function cropImageByCoords(base64DataUrl, rect, scale = 1.0) { // scale 預期是 0.1 到 1.0 之間
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // 應用裝置像素比例 (處理高解析度螢幕)
                const dpr = rect.devicePixelRatio || 1;
                const rectW = rect.width * dpr;
                const rectH = rect.height * dpr;
                const rectX = rect.x * dpr;
                const rectY = rect.y * dpr;

                // 1. 找出較短的一邊，作為最大可能的正方形邊長
                const maxSideLength = Math.min(rectW, rectH);
                
                if (maxSideLength <= 0) {
                    return reject(new Error('裁切範圍無效，目標元素尺寸為 0。'));
                }

                // 2. 應用使用者設定的縮放比例，得到最終的裁切邊長
                const finalSideLength = maxSideLength * scale;

                // 3. 計算原始矩形的中心點
                const centerX = rectX + rectW / 2;
                const centerY = rectY + rectH / 2;

                // 4. 計算正方形左上角的「裁切起始座標 (sx, sy)」
                const sx = centerX - finalSideLength / 2;
                const sy = centerY - finalSideLength / 2;

                // 5. 繪製到 Canvas 上
                const canvas = document.createElement('canvas');
                canvas.width = finalSideLength;
                canvas.height = finalSideLength;
                const ctx = canvas.getContext('2d');
                
                // 從原始大圖中，擷取 (sx, sy) 位置的 finalSideLength * finalSideLength 區域，
                // 然後繪製到 canvas 的 (0, 0) 位置上。
                ctx.drawImage(img, sx, sy, finalSideLength, finalSideLength, 0, 0, finalSideLength, finalSideLength);

                resolve(canvas.toDataURL('image/jpeg', 0.95));
            };
            img.onerror = () => reject(new Error('無法載入截圖進行裁切。'));
            img.src = base64DataUrl;
        });
    }

    // --- 核心函式 (triggerAddToCart, parseOrderComment, setupWebSocketListeners 等保持不變) ---
    async function triggerAddToCart(customerInfo, productInfo, quantity) {
        if (productInfo.stock_quantity < quantity) {
            showToast(`⚠️ ${customerInfo.nickname} 下單失敗，庫存不足！`, 'error');
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'addToCart',
                data: { 
                    uniqueId: customerInfo.uniqueId,
                    productId: productInfo.id, 
                    quantity: quantity 
                }
            });
            if (response && response.success) {
                const productToUpdate = productListData.find(p => p.id === productInfo.id);
                if (productToUpdate) {
                    productToUpdate.stock_quantity -= quantity;
                    renderProducts(productListData);
                }
            } else {
                const errorMessage = (response && response.error) 
                                     || (response && response.data && response.data.message) 
                                     || '加入購物車失敗';
                throw new Error(errorMessage);
            }
        } catch (error) {
            const errorText = error.message || '未知錯誤';
            if (errorText.includes('已成功加入')) {
                 showToast(`❌ 操作失敗：伺服器回傳了非預期的錯誤碼 (但操作可能已成功)。`, 'error');
            } else {
                 showToast(`❌ 操作失敗: ${errorText}`, 'error');
            }
        }
    }

    function parseOrderComment(comment) {
        const trimmedComment = comment.trim();
        const regex = /^([A-Za-z0-9]+)(?:\+(\d+))?$/;
        const match = trimmedComment.match(regex);
        if (!match) return null;
        const callNumber = match[1];
        const quantity = match[2] ? parseInt(match[2], 10) : 1;
        if (isNaN(quantity) || quantity <= 0) return null;
        return { callNumber, quantity };
    }

    function setupWebSocketListeners() {
        if (!websocket) return;
        websocket.onopen = () => {
            isLive = true; isPaused = false;
            showToast('✅ 已連接！正在監控留言...', 'success');
            liveTitleInput.disabled = true; startLiveButton.classList.add('hidden');
            liveControlsDiv.classList.remove('hidden'); pauseResumeButton.textContent = '暫停直播';
        };
        
        websocket.onmessage = (event) => {
            const parsedData = JSON.parse(event.data);
            if (parsedData && parsedData.messages && Array.isArray(parsedData.messages)) {
                parsedData.messages.forEach(msg => {
                    if (msg && msg.data && msg.data.comment && msg.data.user) {
                        const user = msg.data.user;
                        const nickname = user.nickname || '用戶';
                        const uniqueId = user.uniqueId || null;
                        const commentText = msg.data.comment;
                        const order = parseOrderComment(commentText);

                        if (order && uniqueId) {
                            const matchedProduct = productListData.find(p => {
                                const callNumberMeta = p.meta_data.find(m => m.key === 'call_number');
                                const callNumberMatch = callNumberMeta && callNumberMeta.value.toLowerCase() === order.callNumber.toLowerCase();
                                const isPublished = p.status === 'publish';
                                return callNumberMatch && isPublished;
                            });
                            if (matchedProduct) {
                                triggerAddToCart({ nickname, uniqueId }, matchedProduct, order.quantity);
                                const orderLogItem = document.createElement('div');
                                orderLogItem.className = 'order-log-item';
                                orderLogItem.textContent = `[ ${uniqueId} ] ${nickname}: ${commentText}`; 
                                orderLogListDiv.appendChild(orderLogItem);
                                
                                while (orderLogListDiv.children.length > MAX_COMMENTS_IN_LIST) {
                                    orderLogListDiv.removeChild(orderLogListDiv.firstChild);
                                }
                                orderLogListDiv.scrollTop = orderLogListDiv.scrollHeight;
                            }
                        }
                        const commentItem = document.createElement('div');
                        commentItem.className = 'comment-item';
                        commentItem.innerHTML = `<b>${nickname}</b>: ${commentText}`;
                        commentListDiv.appendChild(commentItem);
                        while (commentListDiv.children.length > MAX_COMMENTS_IN_LIST) {
                            commentListDiv.removeChild(commentListDiv.firstChild);
                        }
                        commentListDiv.scrollTop = commentListDiv.scrollHeight;
                    }
                });
            }
        };
        websocket.onclose = (event) => { console.log('WebSocket 連線已關閉:', event); if (isLive) { showToast(`🔌 連線已中斷。Code: ${event.code}`, 'error'); } };
        websocket.onerror = (error) => { console.error('WebSocket 連線發生錯誤:', error); if (isLive && !isPaused) { showToast('❌ 連線發生嚴重錯誤，請查看 Console。', 'error'); } };
    }
    
    // (renderProducts, handleBatchUpdate, openModal, closeModal 等所有非截圖函式都保持不變)
    async function renderProducts(products) {
        productListData = products;
        productsListDiv.innerHTML = '';
        if (products.length === 0) {
            const settings = await chrome.storage.sync.get('defaultCategoryId');
            productsListDiv.textContent = settings.defaultCategoryId ? '此分類尚無商品。' : '請先至「商品設置」分頁設定預設分類。';
            return;
        }
        products.forEach(product => {
            const callNumberMeta = product.meta_data.find(m => m.key === 'call_number');
            const callNumber = callNumberMeta ? callNumberMeta.value : '';
            const isPublished = product.status === 'publish';
            const itemDiv = document.createElement('div');
            itemDiv.className = 'product-list-item';
            itemDiv.innerHTML = `
                <div class="product-item-details">
                    <span class="product-item-name">${product.name}</span>
                    <span class="product-item-info">數量: ${product.stock_quantity || 0} | 價格: ${product.regular_price} | Call: ${callNumber}</span>
                </div>
                <input type="checkbox" class="product-item-toggle" data-id="${product.id}" ${isPublished ? 'checked' : ''}>
                <button class="product-item-edit-button">編輯</button>
            `;
            itemDiv.querySelector('.product-item-edit-button').addEventListener('click', () => openModal(product));
            productsListDiv.appendChild(itemDiv);
        });
    }
    async function handleBatchUpdate(operation, loadingMessage, successMessage) {
        if (productListData.length === 0) {
            showToast('列表無商品可操作', 'info');
            return;
        }
        const productIds = productListData.map(p => p.id);
        showToast(loadingMessage, 'loading');
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'batchUpdateProducts',
                data: { operation, productIds }
            });
            if (response && response.success) {
                await loadAndRenderProducts();
            } else {
                throw new Error(response.error || '批次操作失敗');
            }
        } catch (error) {
            showToast(`❌ ${error.message}`, 'error');
        }
    }
    publishAllBtn.addEventListener('click', () => handleBatchUpdate('publishAll', '⏳ 正在全數上架...', '✅ 已全數上架！'));
    unpublishAllBtn.addEventListener('click', () => handleBatchUpdate('unpublishAll', '⏳ 正在全數下架...', '✅ 已全數下架！'));
    clearCallNumbersBtn.addEventListener('click', () => handleBatchUpdate('clearCallNumbers', '⏳ 正在清空叫號...', '✅ 已清空所有叫號！'));
    productsListDiv.addEventListener('change', async (event) => {
        if (event.target.classList.contains('product-item-toggle')) {
            const checkbox = event.target;
            const productId = parseInt(checkbox.dataset.id, 10);
            const newStatus = checkbox.checked ? 'publish' : 'draft';
            checkbox.disabled = true;
            showToast(`⏳ 正在將商品 #${productId} 更新為 "${newStatus}"...`, 'loading');
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'updateProduct',
                    productId: productId,
                    data: { status: newStatus }
                });
                if (response && response.success) {
                    showToast(`✅ 商品 #${productId} 狀態已更新！`, 'success');
                    const productToUpdate = productListData.find(p => p.id === productId);
                    if(productToUpdate) productToUpdate.status = newStatus;
                } else {
                    throw new Error(response.error || '狀態更新失敗');
                }
            } catch (error) {
                showToast(`❌ ${error.message}`, 'error');
                checkbox.checked = !checkbox.checked;
            } finally {
                checkbox.disabled = false;
            }
        }
    });
    function openModal(product) {
        currentEditingProductId = product.id;
        modalProductName.textContent = `編輯：${product.name}`;
        modalProductQty.value = product.stock_quantity || 0;
        modalProductPrice.value = product.regular_price;
        const callNumberMeta = product.meta_data.find(m => m.key === 'call_number');
        modalProductCall.value = callNumberMeta ? callNumberMeta.value : '';
        modalStatus.textContent = '';
        modal.classList.remove('hidden');
    }
    function closeModal() {
        modal.classList.add('hidden');
        currentEditingProductId = null;
    }
    modalCancelButton.addEventListener('click', closeModal);

    modalUpdateTimeButton.addEventListener('click', async () => {
        if (!currentEditingProductId) return;
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const descriptionContent = `商品上架時間：${timestamp}`;
        modalStatus.textContent = '⏳ 正在更新時間戳記...';
        modalUpdateTimeButton.disabled = true;
        modalUpdateButton.disabled = true;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'updateProduct',
                productId: currentEditingProductId,
                data: { 
                    description: descriptionContent
                } 
            });
            if (response && response.success) {
                modalStatus.textContent = '✅ 時間已更新！';
                setTimeout(() => {
                    closeModal();
                }, 1000);
            } else {
                throw new Error(response.error || '更新失敗');
            }
        } catch (error) {
            modalStatus.textContent = `❌ ${error.message}`;
        } finally {
            modalUpdateTimeButton.disabled = false;
            modalUpdateButton.disabled = false;
        }
    });

    modalUpdateButton.addEventListener('click', async () => {
        if (!currentEditingProductId) return;
        const qty = modalProductQty.value;
        const price = modalProductPrice.value;
        const callNumber = modalProductCall.value;
        modalStatus.textContent = '⏳ 正在更新...';
        modalUpdateButton.disabled = true;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'updateProduct',
                productId: currentEditingProductId,
                data: { qty, price, callNumber }
            });
            if (response && response.success) {
                closeModal();
                await loadAndRenderProducts();
            } else {
                throw new Error(response.error || '更新失敗');
            }
        } catch (error) {
            modalStatus.textContent = `❌ ${error.message}`;
        } finally {
            modalUpdateButton.disabled = false;
        }
    });
    async function loadAndRenderProducts() {
        showToast('🔄 正在載入商品列表...', 'loading');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getProducts' });
            if (response && response.success) {
                renderProducts(response.data);
                showToast('✅ 商品列表已更新', 'success');
            } else {
                throw new Error(response.error || '載入列表失敗');
            }
        } catch (error) {
            showToast(`❌ ${error.message}`, 'error');
        }
    }
    
    // *** 【v32.0 修正】 onMarketButton (只修改 try 區塊) ***
    onMarketButton.addEventListener('click', async () => {
        const name = productNameInput.value.trim();
        const price = productPriceInput.value.trim();
        let qty = productQtyInput.value.trim();
        const callNumber = productCallInput.value.trim();
        const shippingClassSlug = shippingClassSelector.value;
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        if (!name || !price) return showToast('❌ 名稱與價格為必填！', 'error');
        if (qty === '') qty = '999';
        
        onMarketButton.disabled = true;

        try {
            showToast('📸 準備截圖... 3秒後將擷取直播畫面！', 'info', 3500);
            
            // 1. 獲取 Tab ID 和 Selector
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const selector = screenshotSelectorInput.value.trim();
            const scaleValue = parseInt(screenshotScaleInput.value, 10) / 100;
            if (!tab || !tab.id) throw new Error("無法獲取當前分頁 ID。");
            if (!selector) throw new Error('請先在「商品設置」中指定截圖的 CSS 選擇器。');
            
            // 2. 請求 background 執行截圖並回傳原始資料
            const response = await chrome.runtime.sendMessage({
                action: 'takeScreenshot',
                tabId: tab.id,
                selector: selector
            });

            if (!response || !response.success) {
                throw new Error(response.error || '從 background 獲取截圖資料失敗');
            }

            // 將 scaleValue 傳遞給裁切函式
            const croppedDataUrl = await cropImageByCoords(response.data.fullScreenshot, response.data.rect, scaleValue);
            
            showToast('✅ 截圖成功！準備上傳...', 'success');
            screenshotPreview.src = croppedDataUrl;
            screenshotPreview.classList.remove('hidden');
            
            // 4. (後續建立商品的邏輯保持不變)
            const settings = await chrome.storage.sync.get('defaultSupplierId');
            const supplierId = settings.defaultSupplierId || '';
            const createResponse = await chrome.runtime.sendMessage({
                action: 'createProduct',
                data: { 
                    name, qty, price, callNumber, shippingClassSlug, 
                    description: `商品上架時間：${timestamp}`,
                    supplierId: supplierId
                }
            });

            if (createResponse && createResponse.success) {
                productNameInput.value = ''; productQtyInput.value = '';
                productPriceInput.value = ''; productCallInput.value = '';
                await loadAndRenderProducts();
            } else {
                throw new Error(createResponse.error || '上架失敗');
            }
        } catch (error) {
            showToast(`❌ ${error.message}`, 'error');
        } finally {
            onMarketButton.disabled = false;
        }
    });

    // (tabButtons, saveCategoryButton 等非截圖相關事件監聽器保持不變)
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            if (tabId === 'live') {
                if (!isLive) suggestLiveTitle();
                loadShippingClasses();
                loadAndRenderProducts();
            }
            if (tabId === 'products') {
                loadOrRefreshCategories().catch(err => console.error(err));
                loadAndRenderSuppliers().catch(err => console.error(err));
            }
        });
    });
    saveCategoryButton.addEventListener('click', () => {
        const selectedOption = categorySelector.options[categorySelector.selectedIndex];
        const selectedCategoryId = selectedOption.value;
        const selectedCategoryName = selectedOption.text;
        if (!selectedCategoryId) {
            categoryStatusDiv.textContent = '⚠️ 您沒有選擇任何分類。'; return;
        }
        chrome.storage.sync.set({ 
            defaultCategoryId: parseInt(selectedCategoryId, 10),
            defaultCategoryName: selectedCategoryName 
        }, () => {
            updateCurrentCategoryDisplay(selectedCategoryName);
            categoryStatusDiv.textContent = `✅ 已儲存預設分類！`;
            loadAndRenderProducts();
            setTimeout(() => categoryStatusDiv.textContent = '', 3000);
        });
    });

    // --- 唯一的設定讀取與初始化區塊 ---
    chrome.storage.sync.get([ 
        'storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId', 'defaultCategoryName', 
        'eulerstreamKey', 'tiktokUsername',
        'defaultSupplierId', 'defaultSupplierName',
        'screenshotSelector', 'screenshotScale', 'livePreviewEnabled'
    ], (result) => {
        // 填充所有輸入框
        if (result.storeUrl) storeUrlInput.value = result.storeUrl;
        if (result.consumerKey) consumerKeyInput.value = result.consumerKey;
        if (result.consumerSecret) consumerSecretInput.value = result.consumerSecret;
        if (result.eulerstreamKey) eulerstreamKeyInput.value = result.eulerstreamKey;
        if (result.tiktokUsername) tiktokUsernameInput.value = result.tiktokUsername;
        screenshotSelectorInput.value = result.screenshotSelector || '.relative.w-full.flex-1';
        screenshotScaleInput.value = result.screenshotScale || '80';
        livePreviewToggle.checked = !!result.livePreviewEnabled;
        
        // 更新顯示狀態
        suggestLiveTitle();
        updateCurrentCategoryDisplay(result.defaultCategoryName);
        updateLiveManagementDisplay(result.tiktokUsername);
        updateCurrentSupplierDisplay(result.defaultSupplierName);
        
        // 載入動態資料
        loadShippingClasses();
        loadAndRenderProducts();

        // 關鍵：在載入設定後，立即根據當前狀態同步一次預覽
        updatePreviewVisibility(); 
    });
    async function loadShippingClasses() {
        try {
            const settings = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret']);
            if (!settings.storeUrl || !settings.consumerKey || !settings.consumerSecret) return;
            const apiUrl = `${settings.storeUrl}/wp-json/wc/v3/products/shipping_classes`;
            const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
            const response = await fetch(apiUrl, { headers: { 'Authorization': authHeader } });
            if (!response.ok) throw new Error(`獲取運送類別失敗: ${response.status}`);
            const shippingClasses = await response.json();
            populateShippingClassSelector(shippingClasses);
        } catch (error) {
            console.error("載入運送類別時出錯:", error);
        }
    }

    function populateShippingClassSelector(shippingClasses) {
    // 找到 HTML 中的運送類別下拉選單元素
    const selector = document.getElementById('shippingClassSelector');
    if (!selector) return; // 如果找不到元素就直接返回

    // 清空現有選項，並保留第一個預設選項
    selector.innerHTML = '<option value="">-- 運送類別 --</option>';

    // 遍歷從 API 獲取的所有運送類別
    shippingClasses.forEach(shippingClass => {
        // 建立一個新的 <option> 元素
        const option = document.createElement('option');
        
        // 設定選項的值為該類別的 "slug" (這是 API 需要的格式)
        option.value = shippingClass.slug; 
        
        // 設定選項顯示的文字為該類別的名稱
        option.textContent = shippingClass.name;
        
        // 將建立好的選項加入到下拉選單中
        selector.appendChild(option);
    });
}
    
    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // 限制通知數量的邏輯 (保持不變)
        const MAX_TOASTS = 3;
        while (container.children.length >= MAX_TOASTS) {
            container.removeChild(container.firstChild);
        }

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        const messageNode = document.createElement('span');
        messageNode.textContent = message;
        const closeBtn = document.createElement('span');
        closeBtn.className = 'toast-close-btn';
        closeBtn.innerHTML = '&times;';
        const closeToast = () => {
            toast.classList.add('fadeout');
            setTimeout(() => {
                if (toast.parentNode === container) {
                    container.removeChild(toast);
                }
            }, 500);
        };
        closeBtn.onclick = closeToast;
        toast.appendChild(messageNode);
        toast.appendChild(closeBtn);
        container.appendChild(toast);
        toast.classList.add('fadein');
        
        // 【v35.1 修正】 移除錯誤判斷，確保所有通知都會自動關閉。
        // 為 'loading' 類型設定一個預設的較短消失時間，
        // 因為它通常很快會被 'success' 或 'error' 通知所取代。
        const autoCloseDuration = (type === 'loading') ? 3500 : duration;
        setTimeout(closeToast, autoCloseDuration);
    }

    startLiveButton.addEventListener('click', async () => {
        const currentTitle = liveTitleInput.value;
        const parts = currentTitle.split('-');
        if (parts.length !== 2 || parts[0].length !== 6 || parts[1].length !== 2) {
            return showToast('❌ 標題格式不正確 (應為 YYMMDD-SS)', 'error');
        }
        showToast('🔑 正在請求連線網址...', 'loading');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getSignedUrl' });
            if (!response || !response.success || !response.data.signedUrl) {
                throw new Error(response.error || '從背景腳本獲取連線網址失敗。');
            }
            const signedUrl = response.data.signedUrl;
            console.log('成功獲取簽名網址:', signedUrl);
            showToast('📡 驗證成功，正在連接到直播...', 'loading');
            websocket = new WebSocket(signedUrl);
            setupWebSocketListeners();
        } catch (err) {
            console.error('連線過程中發生錯誤:', err);
            showToast(`❌ 連線失敗: ${err.message}`, 'error');
        }
    });
    
    pauseResumeButton.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            if (websocket) websocket.close();
            showToast('⏸️ 直播已暫停。', 'info');
            pauseResumeButton.textContent = '恢復直播';
        } else { startLiveButton.click(); }
    });
    endLiveButton.addEventListener('click', () => {
        if (websocket) websocket.close();
        websocket = null; isLive = false; isPaused = false;
        showToast(`⏹️ 直播 "${liveTitleInput.value}" 已結束。`, 'info');
        liveTitleInput.disabled = false; liveControlsDiv.classList.add('hidden');
        startLiveButton.classList.remove('hidden'); pauseResumeButton.textContent = '暫停直播';
        commentListDiv.innerHTML = ''; orderLogListDiv.innerHTML = '';
        suggestLiveTitle();
    });
    function updateLiveManagementDisplay(username) {
        if (username) {
            currentTiktokUserDisplay.textContent = username;
            currentTiktokUserDisplay.style.color = '#28a745';
        } else {
            currentTiktokUserDisplay.textContent = '尚未設定';
            currentTiktokUserDisplay.style.color = '#dc3545';
        }
    }
    function updateCurrentCategoryDisplay(categoryName) {
        if (categoryName) {
            currentCategoryDisplay.textContent = categoryName;
            currentCategoryDisplay.style.color = '#28a745';
        } else {
            currentCategoryDisplay.textContent = '尚未設定';
            currentCategoryDisplay.style.color = '#dc3545';
        }
    }
    function suggestLiveTitle() {
        if(isLive) return;
        const today = new Date();
        const year = today.getFullYear().toString().slice(-2);
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        const todayDateString = `${year}${month}${day}`;
        const suggestedTitle = `${todayDateString}-01`;
        liveTitleInput.value = suggestedTitle;
    }
    async function fetchProductCategories(data) {
        let allCategories = [];
        let page = 1; const perPage = 100;
        while (true) {
            const url = `${data.storeUrl}/wp-json/wc/v3/products/categories?per_page=${perPage}&page=${page}`;
            const authHeader = 'Basic ' + btoa(`${data.consumerKey}:${data.consumerSecret}`);
            const response = await fetch(url, { headers: { 'Authorization': authHeader } });
            if (!response.ok) throw new Error(`獲取分類失敗: ${response.status}`);
            const fetchedCategories = await response.json();
            if (fetchedCategories.length === 0) break;
            allCategories = allCategories.concat(fetchedCategories); page++;
        }
        return allCategories;
    }
    function populateCategorySelector(categories, savedCategoryId) {
        categorySelector.innerHTML = '<option value="">-- 請選擇一個分類 --</option>';
        categories.forEach(category => {
            if (category.parent === 0) {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categorySelector.appendChild(option);
            }
        });
        if (savedCategoryId) { categorySelector.value = savedCategoryId; }
        categorySelector.disabled = false;
    }
    async function loadOrRefreshCategories() {
        categoryStatusDiv.textContent = '🔄 正在檢查分類資料...';
        const data = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId', 'defaultCategoryName']);
        if (!data.storeUrl || !data.consumerKey || !data.consumerSecret) {
            categoryStatusDiv.textContent = '⚠️ 請先在「商店設定」中完成設定並連線。';
            categorySelector.disabled = true; throw new Error('商店設定不完整');
        }
        const categories = await fetchProductCategories(data);
        categoriesCache = categories; lastFetchTimestamp = Date.now();
        populateCategorySelector(categories, data.defaultCategoryId);
        updateCurrentCategoryDisplay(data.defaultCategoryName);
        categoryStatusDiv.textContent = `✅ 分類已更新！(共 ${categories.length} 個)`;
    }
    saveButton.addEventListener('click', () => {
        const settings = {
            storeUrl: storeUrlInput.value.trim(),
            consumerKey: consumerKeyInput.value.trim(),
            consumerSecret: consumerSecretInput.value.trim(),
            eulerstreamKey: eulerstreamKeyInput.value.trim(),
            tiktokUsername: tiktokUsernameInput.value.trim(),
            screenshotSelector: screenshotSelectorInput.value.trim(),
            screenshotScale: screenshotScaleInput.value.trim(),
            livePreviewEnabled: livePreviewToggle.checked
        };
        chrome.storage.sync.set(settings, () => {
            statusDiv.textContent = '✅ 所有設定已儲存！';
            updateLiveManagementDisplay(settings.tiktokUsername);
            setTimeout(() => statusDiv.textContent = '', 2000);
        });
    });
    testButton.addEventListener('click', async () => {
        statusDiv.textContent = '📡 正在測試商店連線...';
        try {
            await loadOrRefreshCategories();
            await loadAndRenderSuppliers();
            statusDiv.textContent = '✅ 商店連線成功且分類已載入！';
        } catch (error) {
            statusDiv.textContent = `❌ 商店連線失敗: ${error.message}`;
        }
    });

    function updateCurrentSupplierDisplay(supplierName) {
        if (supplierName) {
            currentSupplierDisplay.textContent = supplierName;
            currentSupplierDisplay.style.color = '#28a745';
        } else {
            currentSupplierDisplay.textContent = '尚未設定 (預設將為 站方)';
            currentSupplierDisplay.style.color = '#dc3545';
        }
    }

    function populateSupplierSelector(suppliers, savedSupplierId) {
        supplierSelector.innerHTML = '';
        suppliers.forEach(supplier => {
            const option = document.createElement('option');
            option.value = supplier.id;
            option.textContent = supplier.name;
            supplierSelector.appendChild(option);
        });
        if (savedSupplierId) {
            supplierSelector.value = savedSupplierId;
        } else {
             supplierSelector.value = "";
        }
        supplierSelector.disabled = false;
    }

    async function fetchSuppliers(settings) {
        const apiUrl = `${settings.storeUrl}/wp-json/livestream/v1/get-suppliers`;
        const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': authHeader
            }
        });
        if (!response.ok) {
            throw new Error(`獲取供應商失敗: ${response.status}`);
        }
        return await response.json();
    }

    async function loadAndRenderSuppliers() {
        supplierStatusDiv.textContent = '🔄 正在載入供應商列表...';
        try {
            const data = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultSupplierId', 'defaultSupplierName']);
            if (!data.storeUrl || !data.consumerKey || !data.consumerSecret) {
                throw new Error('商店設定不完整');
            }
            const suppliers = await fetchSuppliers(data);
            populateSupplierSelector(suppliers, data.defaultSupplierId);
            updateCurrentSupplierDisplay(data.defaultSupplierName);
            supplierStatusDiv.textContent = `✅ 供應商列表已更新！`;
        } catch (error) {
            supplierStatusDiv.textContent = `❌ ${error.message}`;
            supplierSelector.disabled = true;
        }
    }

    saveSupplierButton.addEventListener('click', () => {
        const selectedOption = supplierSelector.options[supplierSelector.selectedIndex];
        const selectedSupplierId = selectedOption.value;
        const selectedSupplierName = selectedOption.text;
        chrome.storage.sync.set({ 
            defaultSupplierId: selectedSupplierId,
            defaultSupplierName: selectedSupplierName 
        }, () => {
            updateCurrentSupplierDisplay(selectedSupplierName);
            supplierStatusDiv.textContent = `✅ 已儲存預設供應商！`;
            setTimeout(() => supplierStatusDiv.textContent = '', 3000);
        });
    });

    // *** 【v32.0 修正】 screenshotButton ***
    screenshotButton.addEventListener('click', async () => {
        showToast('📸 準備截圖... 3秒後將擷取直播畫面！', 'info', 3500);
        try {
            // 1. 獲取 Tab ID 和 Selector
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const selector = screenshotSelectorInput.value.trim();
            const scaleValue = parseInt(screenshotScaleInput.value, 10) / 100;
            if (!tab || !tab.id) throw new Error("無法獲取當前分頁 ID。");
            if (!selector) throw new Error('請先在「商品設置」中指定截圖的 CSS 選擇器。');

            // 2. 請求 background 執行截圖並回傳原始資料
            const response = await chrome.runtime.sendMessage({
                action: 'takeScreenshot',
                tabId: tab.id,
                selector: selector
            });

            if (!response || !response.success) {
                throw new Error(response.error || '從 background 獲取截圖資料失敗');
            }

            // 3. 在 side_panel 中執行裁切
            const croppedDataUrl = await cropImageByCoords(response.data.fullScreenshot, response.data.rect, scaleValue);

            // 4. 更新預覽
            screenshotPreview.src = croppedDataUrl;
            screenshotPreview.classList.remove('hidden');
            showToast('✅ 截圖成功！', 'success');

        } catch (error) {
            console.error("截圖流程失敗:", error);
            showToast(`❌ 截圖失敗: ${error.message}`, 'error');
        }
    });
    // --- v35.3 全新重構：即時預覽核心邏輯 ---

    /**
     * 指令發送器：負責向內容腳本發送指令。
     * @param {'update' | 'hide'} action - 要執行的動作。
     */
    async function sendPreviewCommand(action) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id || tab.url.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content_script.js'] });
            if (action === 'update') {
                const selector = screenshotSelectorInput.value.trim();
                const scale = parseInt(screenshotScaleInput.value, 10) / 100;
                if (!selector || isNaN(scale) || scale <= 0) {
                    await chrome.tabs.sendMessage(tab.id, { action: 'hidePreview' });
                } else {
                    await chrome.tabs.sendMessage(tab.id, { action: 'updatePreview', selector, scale });
                }
            } else if (action === 'hide') {
                await chrome.tabs.sendMessage(tab.id, { action: 'hidePreview' });
            }
        } catch (error) {
            if (!error.message.includes('Receiving end does not exist') && !error.message.includes('Cannot access')) {
                 console.warn('發送預覽指令失敗:', error.message);
            }
        }
    }

    function updatePreviewVisibility() {
        const currentTabEl = document.querySelector('.tab-button.active');
        if (!currentTabEl) return;
        const currentTabId = currentTabEl.getAttribute('data-tab');
        const isPreviewTabActive = (currentTabId === 'live' || currentTabId === 'products');
        if (livePreviewToggle.checked && isPreviewTabActive) {
            sendPreviewCommand('update');
        } else {
            sendPreviewCommand('hide');
        }
    }
    
    // 當設定變動時，檢查是否要更新預覽
    function handlePreviewUpdateRequest() {
        if (livePreviewToggle.checked) {
            sendPreviewCommand('update');
        } else {
            // 補上關鍵的 else 邏輯，確保開關關閉時能主動隱藏預覽框
            sendPreviewCommand('hide');
        }
    }
    
    // 當開關狀態改變時的處理
    livePreviewToggle.addEventListener('change', () => {
        updatePreviewVisibility(); // 更新顯示
        chrome.storage.sync.set({ livePreviewEnabled: livePreviewToggle.checked }); // 儲存狀態
    });
    
    // 當輸入框內容改變時，即時更新預覽
    screenshotSelectorInput.addEventListener('input', updatePreviewVisibility);
    screenshotScaleInput.addEventListener('input', updatePreviewVisibility);

    // 3. 切換頂部主分頁時
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 使用 setTimeout 確保 DOM 的 'active' class 已更新，然後再判斷
            setTimeout(updatePreviewVisibility, 0);
        });
    });

    // 4. 當側邊欄關閉時，確保隱藏預覽框
    window.addEventListener('unload', () => {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
            if (tab && tab.id) {
                chrome.tabs.sendMessage(tab.id, { action: 'hidePreview' }).catch(e => {});
            }
        });
    });
});