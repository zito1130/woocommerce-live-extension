// js/api.js

async function sendMessage(action, data = {}) {
    try {
        const response = await chrome.runtime.sendMessage({ action, ...data });
        if (response && response.success) {
            return response.data;
        }
        throw new Error((response && response.error) || '未知錯誤');
    } catch (error) {
        // To prevent "Uncaught (in promise)" errors in the console for expected failures
        console.error(`API call ${action} failed:`, error.message);
        throw error;
    }
}

export const api = {
    getProducts: () => sendMessage('getProducts'),
    createProduct: (productData) => sendMessage('createProduct', { data: productData }),
    updateProduct: (productId, updateData) => sendMessage('updateProduct', { productId, data: updateData }),
    batchUpdateProducts: (operation, productIds) => sendMessage('batchUpdateProducts', { data: { operation, productIds } }),
    addToCart: (cartData) => sendMessage('addToCart', { data: cartData }),
    getSignedUrl: () => sendMessage('getSignedUrl'),
    takeScreenshot: (tabId, selector) => sendMessage('takeScreenshot', { tabId, selector }),
    
    // Direct fetch calls that don't go through background.js
    fetchShippingClasses: async () => {
        const settings = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret']);
        if (!settings.storeUrl || !settings.consumerKey || !settings.consumerSecret) return [];
        const apiUrl = `${settings.storeUrl}/wp-json/wc/v3/products/shipping_classes`;
        const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
        const response = await fetch(apiUrl, { headers: { 'Authorization': authHeader } });
        if (!response.ok) throw new Error(`獲取運送類別失敗: ${response.status}`);
        return await response.json();
    },

    fetchProductCategories: async () => {
        const settings = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret']);
        if (!settings.storeUrl || !settings.consumerKey || !settings.consumerSecret) throw new Error('商店設定不完整');
        
        let allCategories = [];
        let page = 1;
        while (true) {
            const url = `${settings.storeUrl}/wp-json/wc/v3/products/categories?per_page=100&page=${page}`;
            const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
            const response = await fetch(url, { headers: { 'Authorization': authHeader } });
            if (!response.ok) throw new Error(`獲取分類失敗: ${response.status}`);
            const fetchedCategories = await response.json();
            if (fetchedCategories.length === 0) break;
            allCategories = allCategories.concat(fetchedCategories);
            page++;
        }
        return allCategories.filter(category => category.parent === 0); // Only return top-level categories
    },

    fetchSuppliers: async () => {
        const settings = await chrome.storage.sync.get(['storeUrl', 'consumerKey', 'consumerSecret']);
        if (!settings.storeUrl || !settings.consumerKey || !settings.consumerSecret) throw new Error('商店設定不完整');
        const apiUrl = `${settings.storeUrl}/wp-json/livestream/v1/get-suppliers`;
        const authHeader = 'Basic ' + btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
        const response = await fetch(apiUrl, { headers: { 'Authorization': authHeader } });
        if (!response.ok) throw new Error(`獲取供應商失敗: ${response.status}`);
        return await response.json();
    }
};