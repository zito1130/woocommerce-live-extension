document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 ---
    const storeUrlInput = document.getElementById('storeUrl');
    const consumerKeyInput = document.getElementById('consumerKey');
    const consumerSecretInput = document.getElementById('consumerSecret');
    const saveButton = document.getElementById('saveButton');
    const testButton = document.getElementById('testButton');
    const statusDiv = document.getElementById('status');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const categorySelector = document.getElementById('categorySelector');
    const saveCategoryButton = document.getElementById('saveCategoryButton');
    const categoryStatusDiv = document.getElementById('categoryStatus');
    const currentCategoryDisplay = document.getElementById('currentCategoryDisplay');
    const liveTitleInput = document.getElementById('liveTitle');
    const startLiveButton = document.getElementById('startLiveButton');
    const liveStatus = document.getElementById('liveStatus');
    const liveControlsDiv = document.getElementById('liveControls');
    const pauseResumeButton = document.getElementById('pauseResumeButton');
    const endLiveButton = document.getElementById('endLiveButton');

    // --- 狀態變數 ---
    let isLive = false;
    let categoriesCache = null;
    let lastFetchTimestamp = 0;

    // --- 函式定義 ---

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
        let page = 1;
        const perPage = 100;
        while (true) {
            const url = `${data.storeUrl}/wp-json/wc/v3/products/categories?per_page=${perPage}&page=${page}`;
            const authHeader = 'Basic ' + btoa(`${data.consumerKey}:${data.consumerSecret}`);
            const response = await fetch(url, { headers: { 'Authorization': authHeader } });
            if (!response.ok) throw new Error(`獲取分類失敗: ${response.status}`);
            const fetchedCategories = await response.json();
            if (fetchedCategories.length === 0) break;
            allCategories = allCategories.concat(fetchedCategories);
            page++;
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
        if (savedCategoryId) {
            categorySelector.value = savedCategoryId;
        }
        categorySelector.disabled = false;
    }
    
    async function loadOrRefreshCategories() {
        categoryStatusDiv.textContent = '🔄 正在檢查分類資料...';
        const data = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId']);
        if (!data.storeUrl || !data.consumerKey || !data.consumerSecret) {
            categoryStatusDiv.textContent = '⚠️ 請先在「商店設定」中完成設定並連線。';
            categorySelector.disabled = true;
            return;
        }
        try {
            const categories = await fetchProductCategories(data);
            categoriesCache = categories;
            lastFetchTimestamp = Date.now();
            populateCategorySelector(categories, data.defaultCategoryId);
            categoryStatusDiv.textContent = `✅ 分類已更新！(共 ${categories.length} 個)`;
        } catch (error) {
            categoryStatusDiv.textContent = `❌ 分類更新失敗: ${error.message}`;
        }
    }

    // --- 事件監聽器 ---

    startLiveButton.addEventListener('click', async () => {
        if (isLive) return;
        const currentTitle = liveTitleInput.value;
        const parts = currentTitle.split('-');
        if (parts.length !== 2 || parts[0].length !== 6 || parts[1].length !== 2) {
            liveStatus.textContent = '❌ 標題格式不正確 (應為 YYMMDD-SS)';
            liveStatus.style.color = '#dc3545';
            return;
        }
        const datePart = parts[0];
        const sessionPart = parseInt(parts[1], 10);
        await chrome.storage.sync.set({
            lastLiveDate: datePart,
            lastLiveSession: sessionPart
        });
        isLive = true;
        liveStatus.textContent = `✅ 直播 "${currentTitle}" 已開始！`;
        liveStatus.style.color = '#28a745';
        liveTitleInput.disabled = true;
        
        // 隱藏「開始」按鈕，顯示「控制」按鈕
        startLiveButton.classList.add('hidden');
        liveControlsDiv.classList.remove('hidden');
    });

    pauseResumeButton.addEventListener('click', () => {
        isPaused = !isPaused; // 切換暫停狀態

        if (isPaused) {
            liveStatus.textContent = `⏸️ 直播 "${liveTitleInput.value}" 已暫停。`;
            liveStatus.style.color = '#ffc107';
            pauseResumeButton.textContent = '恢復直播';
        } else {
            liveStatus.textContent = `✅ 直播 "${liveTitleInput.value}" 進行中...`;
            liveStatus.style.color = '#28a745';
            pauseResumeButton.textContent = '暫停直播';
        }
    });

    endLiveButton.addEventListener('click', () => {
        isLive = false;
        isPaused = false;

        // 恢復 UI 到初始狀態
        liveStatus.textContent = `⏹️ 直播 "${liveTitleInput.value}" 已結束。準備開始新的一場！`;
        liveStatus.style.color = '#6c757d'; // 灰色
        liveTitleInput.disabled = false;
        
        // 隱藏「控制」按鈕，顯示「開始」按鈕
        liveControlsDiv.classList.add('hidden');
        startLiveButton.classList.remove('hidden');

        // 恢復「暫停」按鈕的預設文字
        pauseResumeButton.textContent = '暫停直播';
        
        // 建議下一場的標題
        suggestLiveTitle();
    });

    saveButton.addEventListener('click', () => {
        const settings = {
            storeUrl: storeUrlInput.value.trim(),
            consumerKey: consumerKeyInput.value.trim(),
            consumerSecret: consumerSecretInput.value.trim()
        };
        chrome.storage.sync.set(settings, () => {
            statusDiv.textContent = '✅ 設定已儲存！';
            setTimeout(() => statusDiv.textContent = '', 2000);
        });
    });

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            if (tabId === 'live' && !isLive) {
                suggestLiveTitle();
            }
            if (tabId === 'products') {
                const fiveMinutes = 5 * 60 * 1000;
                if (!categoriesCache || (Date.now() - lastFetchTimestamp > fiveMinutes)) {
                    loadOrRefreshCategories();
                } else {
                    chrome.storage.sync.get(['defaultCategoryId'], (result) => {
                        populateCategorySelector(categoriesCache, result.defaultCategoryId);
                    });
                    categoryStatusDiv.textContent = 'ℹ️ 分類資料已載入。';
                }
            }
        });
    });

    testButton.addEventListener('click', async () => {
        statusDiv.textContent = '📡 正在連線中...';
        try {
            await loadOrRefreshCategories();
            statusDiv.textContent = '✅ 連線成功且分類已載入！';
        } catch (error) {
            statusDiv.textContent = `❌ 操作失敗: ${error.message}`;
        }
    });

    saveCategoryButton.addEventListener('click', () => {
        const selectedOption = categorySelector.options[categorySelector.selectedIndex];
        const selectedCategoryId = selectedOption.value;
        const selectedCategoryName = selectedOption.text;
        if (!selectedCategoryId) {
            categoryStatusDiv.textContent = '⚠️ 您沒有選擇任何分類。';
            return;
        }
        chrome.storage.sync.set({ 
            defaultCategoryId: selectedCategoryId,
            defaultCategoryName: selectedCategoryName 
        }, () => {
            updateCurrentCategoryDisplay(selectedCategoryName);
            categoryStatusDiv.textContent = `✅ 已儲存預設分類！`;
            setTimeout(() => categoryStatusDiv.textContent = '', 3000);
        });
    });

    // --- 初始載入邏輯 ---
    chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId', 'defaultCategoryName'], (result) => {
        if (result.storeUrl) storeUrlInput.value = result.storeUrl;
        if (result.consumerKey) consumerKeyInput.value = result.consumerKey;
        if (result.consumerSecret) consumerSecretInput.value = result.consumerSecret;
        
        suggestLiveTitle();
        updateCurrentCategoryDisplay(result.defaultCategoryName);
    });

}); // 【修正#1】移除這裡多餘的大括號