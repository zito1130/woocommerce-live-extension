document.addEventListener('DOMContentLoaded', () => {
    const storeUrlInput = document.getElementById('storeUrl');
    const consumerKeyInput = document.getElementById('consumerKey');
    const consumerSecretInput = document.getElementById('consumerSecret');
    const saveButton = document.getElementById('saveButton');
    const testButton = document.getElementById('testButton');
    const statusDiv = document.getElementById('status');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 取得被點擊按鈕的 data-tab 值
            const tabId = button.getAttribute('data-tab');

            // 移除所有按鈕和內容區塊的 active class
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // 為被點擊的按鈕和對應的內容區塊加上 active class
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // 載入已儲存的設定
    chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret'], (result) => {
        if (result.storeUrl) storeUrlInput.value = result.storeUrl;
        if (result.consumerKey) consumerKeyInput.value = result.consumerKey;
        if (result.consumerSecret) consumerSecretInput.value = result.consumerSecret;
    });

    // 儲存設定
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

    async function fetchAllProducts(data) {
        let allProducts = [];
        let page = 1;
        const perPage = 100;

        while (true) {
            const url = `${data.storeUrl}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}`;
            const authHeader = 'Basic ' + btoa(`${data.consumerKey}:${data.consumerSecret}`);

            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader
                }
            });

            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(`伺服器回應錯誤: ${response.status} ${response.statusText} (頁數: ${page})`);
            }

            console.log(`伺服器原始回應（第 ${page} 頁：`, responseText);

            if (!responseText) {
                console.log("回應內容為空，判斷為最後一頁。");
                break;
            }

            let fetchedProducts = [];
            try {
                fetchedProducts = JSON.parse(responseText);
            } catch (jsonError) {
                throw new Error(`回應內容非有效的 JSON 格式。`)
            }

            // const fetchedProducts = await response.json();

            if (fetchedProducts.length === 0) {
                break;
            }

            allProducts = allProducts.concat(fetchedProducts);
            page++;
        }

        return allProducts;
    }

    // 測試連線
    testButton.addEventListener('click', async () => {
        statusDiv.textContent = '📡 正在連線中...';
        const data = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret']);
        
        if (!data.storeUrl || !data.consumerKey || !data.consumerSecret) {
            statusDiv.textContent = '❌ 請先儲存完整的商店設定！';
            return;
        }

        try {
            const products = await fetchAllProducts(data);

            statusDiv.textContent = `連線成功！總共找到了 ${products.length} 件商品。`
            console.log('成功獲取商品列表:', products);

        } catch (error) {
            statusDiv.textContent = `❌ 連線失敗: ${error.message}`;
            console.error('API 請求失敗:', error);
        }
    });
});