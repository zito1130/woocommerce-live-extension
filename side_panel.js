document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM 元素宣告 ---
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

    // --- 2. 狀態變數 ---
    let isLive = false;
    let isPaused = false;
    let websocket = null;
    let categoriesCache = null;
    let lastFetchTimestamp = 0;

    // --- 3. 核心函式 ---
    onMarketButton.addEventListener('click', async () => {
        const name = productNameInput.value.trim();
        const price = productPriceInput.value.trim();
        let qty = productQtyInput.value.trim();
        const callNumber = productCallInput.value.trim();
        const shippingClassSlug = shippingClassSelector.value; // **【修改】** 讀取選擇的 slug

        if (!name || !price) {
            updateMarketStatus('❌ 商品名稱和價格為必填！', 'error');
            return;
        }
        if (qty === '') {
            qty = '999';
        }

        updateMarketStatus('⏳ 正在檢查並上架商品...', 'loading');
        onMarketButton.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'createProduct',
                data: { name, qty, price, callNumber, shippingClassSlug } // **【修改】** 傳送 slug
            });

            if (response && response.success) {
                updateMarketStatus(`✅ 商品 "${response.data.name}" 上架成功！`, 'success');
                productNameInput.value = '';
                productQtyInput.value = '';
                productPriceInput.value = '';
                productCallInput.value = '';
            } else {
                throw new Error(response.error || '未知的錯誤');
            }
        } catch (error) {
            console.error('上架失敗:', error);
            updateMarketStatus(`❌ ${error.message}`, 'error');
        } finally {
            onMarketButton.disabled = false;
        }
    });

    // 填充運送類別下拉選單的函式
    function populateShippingClassSelector(shippingClasses) {
        shippingClassSelector.innerHTML = '<option value="">-- 預設運送類別 --</option>';
        shippingClasses.forEach(sc => {
            const option = document.createElement('option');
            // **【修改】** 將選項的 value 設為 slug，而不是 id
            option.value = sc.slug; 
            option.textContent = sc.name;
            shippingClassSelector.appendChild(option);
        });
    }

    // (此處以下的所有程式碼都保持不變，與之前版本相同)
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
            setupWebSocketListeners();
        } catch (err) {
            console.error('連線過程中發生錯誤:', err);
            updateLiveStatus(`❌ 連線失敗: ${err.message}`, 'error');
        }
    });
    function setupWebSocketListeners() {
        if (!websocket) return;
        websocket.onopen = () => {
            console.log('成功連接到 Eulerstream WebSocket 伺服器');
            isLive = true; isPaused = false;
            updateLiveStatus('✅ 已連接！正在監控留言...', 'success');
            liveTitleInput.disabled = true; startLiveButton.classList.add('hidden');
            liveControlsDiv.classList.remove('hidden'); pauseResumeButton.textContent = '暫停直播';
        };
        websocket.onmessage = (event) => {
            const parsedData = JSON.parse(event.data);
            if (parsedData && parsedData.messages && Array.isArray(parsedData.messages)) {
                parsedData.messages.forEach(msg => {
                    if (msg && msg.data && msg.data.comment) {
                        const nickname = (msg.data.user && msg.data.user.nickname) ? msg.data.user.nickname : '用戶';
                        const commentText = msg.data.comment;
                        const commentItem = document.createElement('div');
                        commentItem.className = 'comment-item';
                        commentItem.innerHTML = `<b>${nickname}</b>: ${commentText}`;
                        commentListDiv.appendChild(commentItem);
                        commentListDiv.scrollTop = commentListDiv.scrollHeight;
                    }
                });
            }
        };
        websocket.onclose = (event) => {
            console.log('WebSocket 連線已關閉:', event);
            if (isLive) { updateLiveStatus(`🔌 連線已中斷。Code: ${event.code}`, 'error'); }
        };
        websocket.onerror = (error) => {
            console.error('WebSocket 連線發生錯誤:', error);
            if (isLive && !isPaused) { updateLiveStatus('❌ 連線發生嚴重錯誤，請查看 Console。', 'error'); }
        };
    }
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
            }
            if (tabId === 'products') {
                const fiveMinutes = 5 * 60 * 1000;
                if (!categoriesCache || (Date.now() - lastFetchTimestamp > fiveMinutes)) {
                    loadOrRefreshCategories().catch(err => console.error(err));
                } else {
                    chrome.storage.sync.get(['defaultCategoryId'], (result) => {
                        populateCategorySelector(categoriesCache, result.defaultCategoryId);
                    });
                    categoryStatusDiv.textContent = 'ℹ️ 分類資料已從快取載入。';
                }
            }
        });
    });
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
            setTimeout(() => categoryStatusDiv.textContent = '', 3000);
        });
    });
    chrome.storage.sync.get([
        'storeUrl', 'consumerKey', 'consumerSecret', 
        'defaultCategoryId', 'defaultCategoryName',
        'eulerstreamKey', 'tiktokUsername'
    ], (result) => {
        if (result.storeUrl) storeUrlInput.value = result.storeUrl;
        if (result.consumerKey) consumerKeyInput.value = result.consumerKey;
        if (result.consumerSecret) consumerSecretInput.value = result.consumerSecret;
        if (result.eulerstreamKey) eulerstreamKeyInput.value = result.eulerstreamKey;
        if (result.tiktokUsername) tiktokUsernameInput.value = result.tiktokUsername;
        suggestLiveTitle();
        updateCurrentCategoryDisplay(result.defaultCategoryName);
        updateLiveManagementDisplay(result.tiktokUsername);
        loadShippingClasses();
    });
});