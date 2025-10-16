// js/product.js (更新後版本)
import { elements } from './constants.js';
import { showToast, openModal, closeModal } from './ui.js';
import { api } from './api.js';
import { takeAndPreviewScreenshot } from './screenshot.js'; // <-- 現在這個 import 會成功

// 將 productListData 保持在模組內部
let productListData = [];
let currentEditingProductId = null;

// 將渲染邏輯獨立出來，方便被其他模組呼叫
export function renderProducts() {
    elements.productsListDiv.innerHTML = '';
    if (productListData.length === 0) {
        elements.productsListDiv.textContent = '此分類尚無商品。';
        return;
    }
    productListData.forEach(product => {
        const callNumber = product.meta_data.find(m => m.key === 'call_number')?.value || '';
        const isPublished = product.status === 'publish';
        const itemDiv = document.createElement('div');
        itemDiv.className = 'product-list-item';
        itemDiv.innerHTML = `
            <div class="product-item-details">
                <span class="product-item-name">${product.name}</span>
                <span class="product-item-info">數量: ${product.stock_quantity || 0} | 價格: ${product.regular_price} | Call: ${callNumber}</span>
            </div>
            <input type="checkbox" class="product-item-toggle" data-id="${product.id}" ${isPublished ? 'checked' : ''}>
            <button class="product-item-edit-button" data-id="${product.id}">編輯</button>
        `;
        elements.productsListDiv.appendChild(itemDiv);
    });
}

export async function loadAndRenderProducts() {
    showToast('🔄 正在載入商品列表...', 'loading');
    try {
        const products = await api.getProducts();
        productListData = products; // 更新模組內的資料
        renderProducts(); // 重新渲染
        showToast('✅ 商品列表已更新', 'success');
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
    }
}

// 導出一個 getter 函式，讓其他模組可以安全地取得資料
export function getProductListData() {
    return productListData;
}

// (此處以下的程式碼與您原本的相同，保持不變)
async function handleBatchUpdate(operation, loadingMessage, successMessage) {
    if (productListData.length === 0) return showToast('列表無商品可操作', 'info');
    const productIds = productListData.map(p => p.id);
    showToast(loadingMessage, 'loading');
    try {
        await api.batchUpdateProducts(operation, productIds);
        await loadAndRenderProducts();
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
    }
}

export function initializeProductManagement() {
    loadAndRenderProducts();

    elements.onMarketButton.addEventListener('click', async () => {
        const { productNameInput, productQtyInput, productPriceInput, productCallInput, shippingClassSelector, onMarketButton } = elements;
        const name = productNameInput.value.trim();
        const price = productPriceInput.value.trim();
        if (!name || !price) return showToast('❌ 名稱與價格為必填！', 'error');

        onMarketButton.disabled = true;
        try {
            await takeAndPreviewScreenshot();
            showToast('⏳ 商品上架中...', 'loading');
            
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            const settings = await chrome.storage.sync.get('defaultSupplierId');

            await api.createProduct({
                name,
                price,
                qty: productQtyInput.value.trim() || '999',
                callNumber: productCallInput.value.trim(),
                shippingClassSlug: shippingClassSelector.value,
                description: `商品上架時間：${timestamp}`,
                supplierId: settings.defaultSupplierId || ''
            });

            productNameInput.value = ''; productQtyInput.value = '';
            productPriceInput.value = ''; productCallInput.value = '';
            await loadAndRenderProducts();

        } catch (error) {
            showToast(`❌ ${error.message}`, 'error');
        } finally {
            onMarketButton.disabled = false;
        }
    });

    elements.publishAllBtn.addEventListener('click', () => handleBatchUpdate('publishAll', '⏳ 正在全數上架...', '✅ 已全數上架！'));
    elements.unpublishAllBtn.addEventListener('click', () => handleBatchUpdate('unpublishAll', '⏳ 正在全數下架...', '✅ 已全數下架！'));
    elements.clearCallNumbersBtn.addEventListener('click', () => handleBatchUpdate('clearCallNumbers', '⏳ 正在清空叫號...', '✅ 已清空所有叫號！'));

    elements.productsListDiv.addEventListener('change', async (event) => {
        if (!event.target.classList.contains('product-item-toggle')) return;
        const checkbox = event.target;
        const productId = parseInt(checkbox.dataset.id, 10);
        const newStatus = checkbox.checked ? 'publish' : 'draft';
        checkbox.disabled = true;
        showToast(`⏳ 更新商品 #${productId} 狀態...`, 'loading');
        try {
            await api.updateProduct(productId, { status: newStatus });
            showToast(`✅ 商品 #${productId} 狀態已更新！`, 'success');
            const productToUpdate = productListData.find(p => p.id === productId);
            if (productToUpdate) productToUpdate.status = newStatus;
        } catch (error) {
            showToast(`❌ ${error.message}`, 'error');
            checkbox.checked = !checkbox.checked;
        } finally {
            checkbox.disabled = false;
        }
    });

    elements.productsListDiv.addEventListener('click', (event) => {
        if (!event.target.classList.contains('product-item-edit-button')) return;
        const productId = parseInt(event.target.dataset.id, 10);
        const product = productListData.find(p => p.id === productId);
        if (product) {
            currentEditingProductId = openModal(product, productListData);
        }
    });

    elements.modalCancelButton.addEventListener('click', () => {
        closeModal();
        currentEditingProductId = null;
    });

    elements.modalUpdateButton.addEventListener('click', async () => {
        if (!currentEditingProductId) return;
        elements.modalStatus.textContent = '⏳ 正在更新...';
        elements.modalUpdateButton.disabled = true;
        try {
            await api.updateProduct(currentEditingProductId, {
                qty: elements.modalProductQty.value,
                price: elements.modalProductPrice.value,
                callNumber: elements.modalProductCall.value,
            });
            closeModal();
            await loadAndRenderProducts();
        } catch (error) {
            elements.modalStatus.textContent = `❌ ${error.message}`;
        } finally {
            elements.modalUpdateButton.disabled = false;
        }
    });

    elements.modalUpdateTimeButton.addEventListener('click', async () => {
        if (!currentEditingProductId) return;
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        elements.modalStatus.textContent = '⏳ 正在更新時間戳記...';
        elements.modalUpdateTimeButton.disabled = true;
        try {
            await api.updateProduct(currentEditingProductId, { description: `商品上架時間：${timestamp}` });
            elements.modalStatus.textContent = '✅ 時間已更新！';
            setTimeout(closeModal, 1000);
        } catch (error) {
            elements.modalStatus.textContent = `❌ ${error.message}`;
        } finally {
            elements.modalUpdateTimeButton.disabled = false;
        }
    });
}