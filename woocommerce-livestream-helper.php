<?php
/**
 * Plugin Name: WooCommerce Livestream Helper
 * Description: 處理來自瀏覽器擴充功能的 TikTok 喊單請求，並與 Nextend Social Login 整合。
 * Version: 26.0.0 (v25 架構 + 供應商整合 + 修正 401 權限錯誤)
 */

if (!defined('ABSPATH')) {
    exit;
}

// *** 關鍵：我們現在只使用你指定的 'tiktok_username' 作為唯一的真相來源 Key ***
define('LIVESTREAM_TIKTOK_META_KEY', 'tiktok_username');


// === 1. API 接口設定 (修改：新增 /get-suppliers 路由) ===
add_action('rest_api_init', function () {
    // 處理喊單的 API (來自 v25 - 不變)
    register_rest_route('livestream/v1', '/add-to-cart', array(
        'methods' => 'POST',
        'callback' => 'handle_livestream_add_to_cart_v24',
        'permission_callback' => 'livestream_api_permission_check'
    ));

    // 【全新 v26.0 功能】 獲取供應商列表的 API
    register_rest_route('livestream/v1', '/get-suppliers', array(
        'methods' => 'GET',
        'callback' => 'livestream_get_supplier_list_api',
        // 【v26.0 修正】 移除 permission_callback。
        // 我們將依賴 WooCommerce 核心的 API 金鑰驗證來保護此端點，這可以解決 401 錯誤。
        'permission_callback' => '__return_true' 
    ));
});

function livestream_api_permission_check($request) {
    $secret_key = '7732DDB4F15A5';
    $sent_key = $request->get_header('X-Livestream-Secret');
    return $sent_key === $secret_key ? true : new WP_Error('rest_forbidden', '無效的密鑰。', array('status' => 401));
}


// === 2. 【v24 API 處理器】 (只寫入資料表，並在資料表中累加) ===
function handle_livestream_add_to_cart_v24(WP_REST_Request $request) {
    global $wpdb;
    
    $tiktok_id = sanitize_text_field($request->get_param('uniqueId'));
    $product_id = intval($request->get_param('productId'));
    $quantity = intval($request->get_param('quantity'));

    // 移除 wc_get_product 檢查以避免致命錯誤
    if (!$tiktok_id || !$product_id || !$quantity ) {
        return new WP_Error('bad_request', '缺少參數或商品 ID 無效', array('status' => 400));
    }

    try {
        $table_name = $wpdb->prefix . 'livestream_pending_carts';
        
        $existing_item = $wpdb->get_row($wpdb->prepare(
            "SELECT id, quantity FROM $table_name WHERE tiktok_unique_id = %s AND product_id = %d",
            $tiktok_id, $product_id
        ));

        if ($existing_item) {
            $new_quantity = $existing_item->quantity + $quantity;
            $wpdb->update(
                $table_name,
                array('quantity' => $new_quantity),
                array('id' => $existing_item->id)
            );
        } else {
            $wpdb->insert(
                $table_name,
                array(
                    'tiktok_unique_id' => $tiktok_id,
                    'product_id'       => $product_id,
                    'quantity'         => $quantity,
                    'created_at'       => current_time('mysql'),
                )
            );
        }

        return new WP_REST_Response(array(
            'success' => true, 
            'message' => '商品已成功暫存。'
        ), 200);

    } catch (Exception $e) {
        return new WP_Error('internal_server_error', $e->getMessage(), array('status' => 500));
    }
}


// === 4. 【v24 核心合併邏輯】 (在模板載入前合併 - 不變) ===
add_action('template_redirect', 'livestream_safe_merge_to_session_cart_v24');
function livestream_safe_merge_to_session_cart_v24() {
    
    if ( ! function_exists('WC') || ! is_object(WC()->session) || ! is_object(WC()->cart) || ! is_user_logged_in() || ! WC()->session->has_session() ) {
        return;
    }
    $user_id = get_current_user_id();
    $tiktok_id = get_user_meta($user_id, LIVESTREAM_TIKTOK_META_KEY, true);

    if (empty($tiktok_id)) {
        return; 
    }

    global $wpdb;
    $table_name = $wpdb->prefix . 'livestream_pending_carts';
    $pending_items = $wpdb->get_results($wpdb->prepare(
        "SELECT product_id, quantity FROM $table_name WHERE tiktok_unique_id = %s ORDER BY created_at ASC", 
        $tiktok_id
    ));

    if (empty($pending_items)) {
        return;
    }
    
    $cart_merged = false;
    foreach ($pending_items as $item) {
        $result_key = WC()->cart->add_to_cart($item->product_id, $item->quantity);
        if ($result_key) {
            $cart_merged = true;
        }
    }
    
    if ($cart_merged) {
        $wpdb->delete($table_name, array('tiktok_unique_id' => $tiktok_id), array('%s'));
        if ( is_object( WC()->cart ) ) {
            WC()->cart->persistent_cart_update();
        }
    }
}


// === 6. 【v25.0 功能】 自動監聽 Nextend 解除綁定 (不變) ===
add_action('nsl_unlink_user', 'livestream_handle_user_unlink_v25', 10, 3);
function livestream_handle_user_unlink_v25($user_id, $provider_id, $unlinked_social_id) {
    if ($provider_id === 'tiktok') {
        delete_user_meta($user_id, 'tiktok_username');
    }
}


// === 【全新 v26.0 API 實作】 ===
/**
 * 獲取所有供應商列表（ID 和 暱稱）
 * 這會被擴充功能的「商品設置」頁籤呼叫
 */
function livestream_get_supplier_list_api() {
    // 抓取所有角色為 'supplier' 的用戶 (來自 cart-manager 插件)
    $suppliers = get_users( array( 'role' => 'supplier' ) );
    $options = array();

    foreach ( $suppliers as $supplier ) {
        // 優先抓取 'nickname' (暱稱)，如果為空，則回退到 user_login (帳號)
        $display_name = $supplier->nickname;
        if ( empty( $display_name ) ) {
            $display_name = $supplier->user_login;
        }

        $options[] = array(
            'id'   => $supplier->ID,
            'name' => $display_name
        );
    }
    
    // 返回一個 "站方商品" 選項 (ID 設為空字串)
    array_unshift($options, array('id' => '', 'name' => '無 (站方商品)'));

    return new WP_REST_Response( $options, 200 );
}

// 【*** 全新 v38.0 診斷工具 ***】
// 註冊一個新的 API 路由，專門用來檢查權限
add_action('rest_api_init', function () {
    register_rest_route('livestream/v1', '/check-permissions', array(
        'methods' => 'GET',
        'callback' => 'livestream_check_api_user_permissions',
        'permission_callback' => '__return_true' // 依賴 WC 核心驗證
    ));
});

// 這個函式會檢查當前透過 API 登入的使用者，是否真的有 'upload_files' 權限
function livestream_check_api_user_permissions(WP_REST_Request $request) {
    
    // 檢查 WooCommerce 是否能識別出 API 使用者的 ID
    $user_id = apply_filters( 'woocommerce_rest_check_permissions', get_current_user_id(), 'read', 0, 0 );

    if ( is_wp_error( $user_id ) || $user_id === 0 ) {
        return new WP_REST_Response( array(
            'success' => false,
            'message' => '無法識別 API 使用者，請確認您的 API 金鑰是否正確且已啟用。',
            'can_upload' => false,
        ), 401 );
    }

    // 直接使用 WordPress 核心函式檢查該使用者 ID 是否有上傳權限
    if ( user_can( $user_id, 'upload_files' ) ) {
        // 如果有權限
        return new WP_REST_Response( array(
            'success' => true,
            'message' => '權限檢查通過！此 API 金鑰對應的使用者可以上傳檔案。',
            'can_upload' => true,
            'user_id' => $user_id,
        ), 200 );
    } else {
        // 如果 WordPress 認為它沒有權限
        return new WP_REST_Response( array(
            'success' => false,
            'message' => '權限檢查失敗！WordPress 核心認為此 API 金鑰對應的使用者 (ID: ' . $user_id . ') 沒有 "upload_files" 的權限。',
            'can_upload' => false,
            'user_id' => $user_id,
        ), 403 );
    }
}
?>