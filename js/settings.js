// js/settings.js
import { elements } from './constants.js';
import { showToast, populateSelector, updateDisplay, suggestLiveTitle } from './ui.js';
import { api } from './api.js';

// 【*** 關鍵修正 ***】
// 修改此函式，使其能正確處理 storageKey 為 null 的情況
async function loadAndPopulate(apiMethod, selector, storageKey, displayElement, defaultText, valueField, nameField) {
    try {
        const items = await apiMethod();
        
        // 如果 storageKey 存在，才從 Chrome Storage 讀取資料；否則，使用一個空物件。
        const settings = storageKey ? await chrome.storage.sync.get([storageKey]) : {};
        const savedId = storageKey ? settings[storageKey] : null;

        populateSelector(selector, items, savedId, defaultText, valueField, nameField);
        
        const selectedItem = items.find(i => i[valueField] == savedId);
        const selectedName = selectedItem ? selectedItem[nameField] : undefined;

        if (displayElement) {
            updateDisplay(displayElement, selectedName, !!savedId);
        }
        return items;
    } catch (error) {
        showToast(`❌ 載入${defaultText}失敗: ${error.message}`, 'error');
        if (selector) selector.disabled = true;
    }
}

async function saveSetting(key, value, nameKey, nameValue, statusDiv, displayElement) {
    await chrome.storage.sync.set({ [key]: value, [nameKey]: nameValue });
    statusDiv.textContent = '✅ 已儲存！';
    if(displayElement) updateDisplay(displayElement, nameValue, !!value);
    setTimeout(() => statusDiv.textContent = '', 3000);
}

export async function initializeSettings(loadAndRenderProducts) {
    const { 
        storeUrlInput, consumerKeyInput, consumerSecretInput, eulerstreamKeyInput, tiktokUsernameInput, 
        screenshotSelectorInput, screenshotScaleInput, livePreviewToggle, currentTiktokUserDisplay, 
        liveTitleInput, categorySelector, currentCategoryDisplay, supplierSelector, currentSupplierDisplay
    } = elements;

    const result = await chrome.storage.sync.get([
        'storeUrl', 'consumerKey', 'consumerSecret', 'defaultCategoryId', 'defaultCategoryName', 
        'eulerstreamKey', 'tiktokUsername', 'defaultSupplierId', 'defaultSupplierName',
        'screenshotSelector', 'screenshotScale', 'livePreviewEnabled'
    ]);

    storeUrlInput.value = result.storeUrl || '';
    consumerKeyInput.value = result.consumerKey || '';
    consumerSecretInput.value = result.consumerSecret || '';
    eulerstreamKeyInput.value = result.eulerstreamKey || '';
    tiktokUsernameInput.value = result.tiktokUsername || '';
    screenshotSelectorInput.value = result.screenshotSelector || '.relative.w-full.flex-1';
    screenshotScaleInput.value = result.screenshotScale || '80';
    livePreviewToggle.checked = !!result.livePreviewEnabled;
    
    updateDisplay(currentTiktokUserDisplay, result.tiktokUsername, !!result.tiktokUsername);
    updateDisplay(currentCategoryDisplay, result.defaultCategoryName, result.defaultCategoryId);
    updateDisplay(currentSupplierDisplay, result.defaultSupplierName, !!result.defaultSupplierId);
    if (!liveTitleInput.value) liveTitleInput.value = suggestLiveTitle();

    // 這個呼叫現在是安全的了
    loadAndPopulate(api.fetchShippingClasses, elements.shippingClassSelector, null, null, '運送類別', 'slug', 'name');
    
    elements.saveButton.addEventListener('click', () => {
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
            showToast('✅ 所有設定已儲存！', 'success');
            updateDisplay(currentTiktokUserDisplay, settings.tiktokUsername, !!settings.tiktokUsername);
        });
    });

    elements.testButton.addEventListener('click', async () => {
        elements.statusDiv.textContent = '📡 正在測試連線...';
        try {
            await loadAndPopulate(api.fetchProductCategories, categorySelector, 'defaultCategoryId', currentCategoryDisplay, '一個分類', 'id', 'name');
            await loadAndPopulate(api.fetchSuppliers, supplierSelector, 'defaultSupplierId', currentSupplierDisplay, '一個供應商', 'id', 'name');
            elements.statusDiv.textContent = '✅ 連線成功且資料已載入！';
        } catch (error) {
            elements.statusDiv.textContent = `❌ 連線失敗: ${error.message}`;
        }
    });

    elements.saveCategoryButton.addEventListener('click', () => {
        const { selectedIndex, value, options } = categorySelector;
        if (!value) return; // 避免儲存空值
        const selectedText = options[selectedIndex] ? options[selectedIndex].text : '';
        saveSetting('defaultCategoryId', value, 'defaultCategoryName', selectedText, elements.categoryStatusDiv, currentCategoryDisplay);
        loadAndRenderProducts();
    });

    elements.saveSupplierButton.addEventListener('click', () => {
        const { selectedIndex, value, options } = supplierSelector;
        const selectedText = options[selectedIndex] ? options[selectedIndex].text : '';
        saveSetting('defaultSupplierId', value, 'defaultSupplierName', selectedText, elements.supplierStatusDiv, currentSupplierDisplay);
    });
}

export async function loadDynamicSettings() {
    loadAndPopulate(api.fetchShippingClasses, elements.shippingClassSelector, null, null, '運送類別', 'slug', 'name');
    loadAndPopulate(api.fetchProductCategories, elements.categorySelector, 'defaultCategoryId', elements.currentCategoryDisplay, '一個分類', 'id', 'name');
    loadAndPopulate(api.fetchSuppliers, elements.supplierSelector, 'defaultSupplierId', elements.currentSupplierDisplay, '一個供應商', 'id', 'name');
}