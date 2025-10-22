// side_panel.js (主入口檔案 - 更新後版本)
import { elements } from './js/constants.js';
import { initializeSettings, loadDynamicSettings } from './js/settings.js';
import { initializeScreenshotAndPreview } from './js/screenshot.js';
// 直接 import 需要的函式
import { initializeProductManagement, loadAndRenderProducts, getProductListData, renderProducts } from './js/product.js';
import { initializeLiveControls } from './js/live.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化商品管理，這會自動載入商品列表
    initializeProductManagement();

    // 2. 初始化設定頁面，並傳入 loadAndRenderProducts 函式
    initializeSettings(loadAndRenderProducts);

    // 3. 初始化截圖與即時預覽功能
    const { updatePreviewVisibility } = initializeScreenshotAndPreview();
    
    // 4. 初始化直播控制按鈕，直接傳入需要的函式
    initializeLiveControls();

    // 5. 設定 Tab 切換邏輯 (保持不變)
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            
            elements.tabButtons.forEach(btn => btn.classList.remove('active'));
            elements.tabPanes.forEach(pane => pane.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // 根據不同 Tab 載入對應的資料
            if (tabId === 'live') {
                loadAndRenderProducts();
            }
            if (tabId === 'products') {
                loadDynamicSettings();
            }

            // 更新截圖預覽的可見性
            setTimeout(updatePreviewVisibility, 0);
        });
    });
});