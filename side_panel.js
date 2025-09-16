document.addEventListener('DOMContentLoaded', () => {
    // (所有元素宣告和狀態變數不變)
    const productsListDiv = document.getElementById('productsList');
    const modal = document.getElementById('editProductModal');
    const modalProductName = document.getElementById('modalProductName');
    const modalProductQty = document.getElementById('modalProductQty');
    const modalProductPrice = document.getElementById('modalProductPrice');
    const modalProductCall = document.getElementById('modalProductCall');
    const modalUpdateButton = document.getElementById('modalUpdateButton');
    const modalCancelButton = document.getElementById('modalCancelButton');
    const modalStatus = document.getElementById('modalStatus');
    const publishAllBtn = document.getElementById('publishAllBtn');
    const unpublishAllBtn = document.getElementById('unpublishAllBtn');
    const clearCallNumbersBtn = document.getElementById('clearCallNumbersBtn');
    const commentListDiv = document.getElementById('comment-list');
    const liveTitleInput = document.getElementById('liveTitle');
    const startLiveButton = document.getElementById('startLiveButton');
    const liveStatus = document.getElementById('liveStatus');
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
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const productNameInput = document.getElementById('productName');
    const productQtyInput = document.getElementById('productQty');
    const productPriceInput = document.getElementById('productPrice');
    const productCallInput = document.getElementById('productCall');
    const onMarketButton = document.getElementById('onMarketButton');
    const marketStatus = document.getElementById('marketStatus');
    const shippingClassSelector = document.getElementById('shippingClassSelector');

    let currentEditingProductId = null;
    let productListData = [];
    let isLive = false;
    let isPaused = false;
    let websocket = null;
    let categoriesCache = null;
    let lastFetchTimestamp = 0;

    // --- 3. 核心函式 ---
    async function triggerAddToCart(customerInfo, productInfo, quantity) {
        if (productInfo.stock_quantity < quantity) {
            updateMarketStatus(`⚠️ ${customerInfo.nickname} 下單失敗，庫存不足！`, 'error');
            return;
        }
        updateMarketStatus(`⏳ 正在為 ${customerInfo.nickname} 加入購物車...`, 'loading');
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
                updateMarketStatus(`✅ 已將商品加入 ${customerInfo.nickname} 的購物車！`, 'success');
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
            
            // 如果錯誤訊息 bizarrely 包含了「成功」字樣，我們就覆蓋掉它。
            if (errorText.includes('已成功加入')) {
                 updateMarketStatus(`❌ 操作失敗：伺服器回傳了非預期的錯誤碼 (但操作可能已成功)。`, 'error');
            } else {
                 updateMarketStatus(`❌ 操作失敗: ${errorText}`, 'error');
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
            updateLiveStatus('✅ 已連接！正在監控留言...', 'success');
            liveTitleInput.disabled = true; startLiveButton.classList.add('hidden');
            liveControlsDiv.classList.remove('hidden'); pauseResumeButton.textContent = '暫停直播';
        };
        
        websocket.onmessage = (event) => {
            const parsedData = JSON.parse(event.data);
            if (parsedData && parsedData.messages && Array.isArray(parsedData.messages)) {
                parsedData.messages.forEach(msg => {
                    if (msg && msg.data && msg.data.comment && msg.data.user) {
                        const user = msg.data.user; // **【修改】** 先定義好 user 變數
                        const nickname = user.nickname || '用戶';
                        const uniqueId = user.uniqueId || null;
                        const commentText = msg.data.comment;
                        const order = parseOrderComment(commentText);

                        if (order && uniqueId) {
                            console.log("---------- [偵測到指令] ----------");
                            // **【修改】** 使用正確的 user 變數
                            console.log("收到的原始 User 物件:", user); 
                            console.log("嘗試使用的 uniqueId:", user.uniqueId);
                            console.log("---------------------------------");
                            
                            const matchedProduct = productListData.find(p => {
                                const callNumberMeta = p.meta_data.find(m => m.key === 'call_number');
                                const callNumberMatch = callNumberMeta && callNumberMeta.value.toLowerCase() === order.callNumber.toLowerCase();
                                const isPublished = p.status === 'publish';
                                return callNumberMatch && isPublished;
                            });
                            if (matchedProduct) {
                                console.log(`[有效指令] 用戶: ${nickname} (ID: ${uniqueId}), Call號: ${order.callNumber}, 數量: ${order.quantity}`);
                                triggerAddToCart({ nickname, uniqueId }, matchedProduct, order.quantity);
                            }
                        }
                        const commentItem = document.createElement('div');
                        commentItem.className = 'comment-item';
                        commentItem.innerHTML = `<b>${nickname}</b>: ${commentText}`;
                        commentListDiv.appendChild(commentItem);
                        commentListDiv.scrollTop = commentListDiv.scrollHeight;
                    }
                });
            }
        };
        websocket.onclose = (event) => { console.log('WebSocket 連線已關閉:', event); if (isLive) { updateLiveStatus(`🔌 連線已中斷。Code: ${event.code}`, 'error'); } };
        websocket.onerror = (error) => { console.error('WebSocket 連線發生錯誤:', error); if (isLive && !isPaused) { updateLiveStatus('❌ 連線發生嚴重錯誤，請查看 Console。', 'error'); } };
    }
    
    // (其他所有函式都保持不變)
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
            updateMarketStatus('列表無商品可操作', 'info');
            return;
        }
        const productIds = productListData.map(p => p.id);
        updateMarketStatus(loadingMessage, 'loading');
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
            updateMarketStatus(`❌ ${error.message}`, 'error');
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
            updateMarketStatus(`⏳ 正在將商品 #${productId} 更新為 "${newStatus}"...`, 'loading');
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'updateProduct',
                    productId: productId,
                    data: { status: newStatus }
                });
                if (response && response.success) {
                    updateMarketStatus(`✅ 商品 #${productId} 狀態已更新！`, 'success');
                    const productToUpdate = productListData.find(p => p.id === productId);
                    if(productToUpdate) productToUpdate.status = newStatus;
                } else {
                    throw new Error(response.error || '狀態更新失敗');
                }
            } catch (error) {
                updateMarketStatus(`❌ ${error.message}`, 'error');
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
        updateMarketStatus('🔄 正在載入商品列表...', 'loading');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getProducts' });
            if (response && response.success) {
                renderProducts(response.data);
                updateMarketStatus('✅ 商品列表已更新', 'success');
            } else {
                throw new Error(response.error || '載入列表失敗');
            }
        } catch (error) {
            updateMarketStatus(`❌ ${error.message}`, 'error');
        }
    }
    onMarketButton.addEventListener('click', async () => {
        const name = productNameInput.value.trim();
        const price = productPriceInput.value.trim();
        let qty = productQtyInput.value.trim();
        const callNumber = productCallInput.value.trim();
        const shippingClassSlug = shippingClassSelector.value;
        if (!name || !price) {
            return updateMarketStatus('❌ 名稱與價格為必填！', 'error');
        }
        if (qty === '') qty = '999';
        updateMarketStatus('⏳ 正在上架商品...', 'loading');
        onMarketButton.disabled = true;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'createProduct',
                data: { name, qty, price, callNumber, shippingClassSlug }
            });
            if (response && response.success) {
                productNameInput.value = '';
                productQtyInput.value = '';
                productPriceInput.value = '';
                productCallInput.value = '';
                await loadAndRenderProducts();
            } else {
                throw new Error(response.error || '上架失敗');
            }
        } catch (error) {
            updateMarketStatus(`❌ ${error.message}`, 'error');
        } finally {
            onMarketButton.disabled = false;
        }
    });
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
    chrome.storage.sync.get([ 'storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId', 'defaultCategoryName', 'eulerstreamKey', 'tiktokUsername' ], (result) => {
        if (result.storeUrl) storeUrlInput.value = result.storeUrl;
        if (result.consumerKey) consumerKeyInput.value = result.consumerKey;
        if (result.consumerSecret) consumerSecretInput.value = result.consumerSecret;
        if (result.eulerstreamKey) eulerstreamKeyInput.value = result.eulerstreamKey;
        if (result.tiktokUsername) tiktokUsernameInput.value = result.tiktokUsername;
        suggestLiveTitle();
        updateCurrentCategoryDisplay(result.defaultCategoryName);
        updateLiveManagementDisplay(result.tiktokUsername);
        loadShippingClasses();
        loadAndRenderProducts();
    });
    function populateShippingClassSelector(shippingClasses) {
        shippingClassSelector.innerHTML = '<option value="">-- 預設運送類別 --</option>';
        shippingClasses.forEach(sc => {
            const option = document.createElement('option');
            option.value = sc.slug; 
            option.textContent = sc.name;
            shippingClassSelector.appendChild(option);
        });
    }
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
    function updateMarketStatus(message, type = 'info') {
        marketStatus.textContent = message;
        marketStatus.style.color = { 'info': '#6c757d', 'success': '#28a745', 'error': '#dc3545', 'loading': '#007bff' }[type];
    }
    function updateLiveStatus(message, type = 'info') {
        liveStatus.textContent = message;
        liveStatus.style.color = { 'info': '#6c757d', 'success': '#28a745', 'error': '#dc3545', 'loading': '#007bff' }[type];
    }
    startLiveButton.addEventListener('click', async () => {
        const currentTitle = liveTitleInput.value;
        const parts = currentTitle.split('-');
        if (parts.length !== 2 || parts[0].length !== 6 || parts[1].length !== 2) {
            return updateLiveStatus('❌ 標題格式不正確 (應為 YYMMDD-SS)', 'error');
        }
        updateLiveStatus('🔑 正在請求連線網址...', 'loading');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getSignedUrl' });
            if (!response || !response.success || !response.data.signedUrl) {
                throw new Error(response.error || '從背景腳本獲取連線網址失敗。');
            }
            const signedUrl = response.data.signedUrl;
            console.log('成功獲取簽名網址:', signedUrl);
            updateLiveStatus('📡 驗證成功，正在連接到直播...', 'loading');
            websocket = new WebSocket(signedUrl);
            setupWebSocketListeners(); // 呼叫函式
        } catch (err) {
            console.error('連線過程中發生錯誤:', err);
            updateLiveStatus(`❌ 連線失敗: ${err.message}`, 'error');
        }
    });
    
    // (其他函式不變)
    pauseResumeButton.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            if (websocket) websocket.close();
            updateLiveStatus('⏸️ 直播已暫停。', 'info');
            pauseResumeButton.textContent = '恢復直播';
        } else { startLiveButton.click(); }
    });
    endLiveButton.addEventListener('click', () => {
        if (websocket) websocket.close();
        websocket = null; isLive = false; isPaused = false;
        updateLiveStatus(`⏹️ 直播 "${liveTitleInput.value}" 已結束。`, 'info');
        liveTitleInput.disabled = false; liveControlsDiv.classList.add('hidden');
        startLiveButton.classList.remove('hidden'); pauseResumeButton.textContent = '暫停直播';
        commentListDiv.innerHTML = ''; suggestLiveTitle();
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
            tiktokUsername: tiktokUsernameInput.value.trim()
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
            statusDiv.textContent = '✅ 商店連線成功且分類已載入！';
        } catch (error) {
            statusDiv.textContent = `❌ 商店連線失敗: ${error.message}`;
        }
    });
});