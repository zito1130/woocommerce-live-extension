<?php
/**
 * Plugin Name: WooCommerce Livestream Helper
 * Description: 處理來自瀏覽器擴充功能的 TikTok 喊單請求，並與 Nextend Social Login 整合。
 * Version: 26.0.0 (v24 架構 + Unlink 自動清理鉤子 - 精簡版)
 */

if (!defined('ABSPATH')) {
    exit;
}

// (已移除 Define 常數，因為我們直接使用 'tiktok_username')


// === 1. API 接口設定 (不變) ===
add_action('rest_api_init', function () {
    register_rest_route('livestream/v1', '/add-to-cart', array(
        'methods' => 'POST',
        'callback' => 'handle_livestream_add_to_cart_v24', // 使用 "笨" API
        'permission_callback' => 'livestream_api_permission_check'
    ));
});

function livestream_api_permission_check($request) {
    $secret_key = '7732DDB4F15A5';
    $sent_key = $request->get_header('X-Livestream-Secret');
    return $sent_key === $secret_key ? true : new WP_Error('rest_forbidden', '無效的密鑰。', array('status' => 401));
}


// === 2. 【v24 API 處理器 (來自 v18)】 (只寫入資料表，並在資料表中累加) ===
/**
 * API 不再查詢用戶。它只有一個職責：
 * 驗證資料，並在「自訂資料表」中正確地累加/插入商品。
 */
function handle_livestream_add_to_cart_v24(WP_REST_Request $request) {
    global $wpdb;
    
    $tiktok_id = sanitize_text_field($request->get_param('uniqueId'));
    $product_id = intval($request->get_param('productId'));
    $quantity = intval($request->get_param('quantity'));

    // 確保商品存在
    if (!$tiktok_id || !$product_id || !$quantity || !wc_get_product($product_id) ) {
        return new WP_Error('bad_request', '缺少參數或商品 ID 無效', array('status' => 400));
    }

    try {
        // 無論用戶是誰，一律寫入「待處理」資料表。
        $table_name = $wpdb->prefix . 'livestream_pending_carts';
        
        $existing_item = $wpdb->get_row($wpdb->prepare(
            "SELECT id, quantity FROM $table_name WHERE tiktok_unique_id = %s AND product_id = %d",
            $tiktok_id, $product_id
        ));

        if ($existing_item) {
            // 找到了！正確累加數量
            $new_quantity = $existing_item->quantity + $quantity;
            $wpdb->update(
                $table_name,
                array('quantity' => $new_quantity),
                array('id' => $existing_item->id)
            );
        } else {
            // 沒找到，插入新的一行
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

        // 合併的工作將 100% 交給 Function 4 (template_redirect 鉤子) 處理。
        return new WP_REST_Response(array(
            'success' => true, 
            'message' => '商品已成功暫存。' // 統一回傳「暫存」訊息
        ), 200);

    } catch (Exception $e) {
        return new WP_Error('internal_server_error', $e->getMessage(), array('status' => 500));
    }
}


// === 3. (已移除) ===
// 我們不再需要 add_product_to_persistent_cart (永久購物車) 函式。


// === 4. 【v24 核心合併邏輯】 (來自 v19 - 在模板載入前合併) ===
/**
 * 這是我們唯一的合併點。它在 WordPress 完全載入後才執行。
 * 它會讀取 Nextend 已經設定好的 'tiktok_username' key。
 */
add_action('template_redirect', 'livestream_safe_merge_to_session_cart_v24');
function livestream_safe_merge_to_session_cart_v24() {
    
    // 1. 確保我們在安全的環境執行 (template_redirect 只在前端執行)
    if ( ! function_exists('WC') || ! is_object(WC()->session) || ! is_object(WC()->cart) || ! is_user_logged_in() || ! WC()->session->has_session() ) {
        return;
    }

    $user_id = get_current_user_id();
    
    // 2. 獲取當前登入用戶的 TikTok ID (只讀取 'tiktok_username' key)
    $tiktok_id = get_user_meta($user_id, 'tiktok_username', true);

    if (empty($tiktok_id)) {
        // 如果 Nextend 還沒設定好這個 key，或者這不是 TikTok 用戶，我們就退出
        return; 
    }

    // 3. 檢查自訂資料表是否有這個 ID 的待處理商品
    global $wpdb;
    $table_name = $wpdb->prefix . 'livestream_pending_carts';

    $pending_items = $wpdb->get_results($wpdb->prepare(
        "SELECT product_id, quantity FROM $table_name WHERE tiktok_unique_id = %s ORDER BY created_at ASC", 
        $tiktok_id
    ));

    if (empty($pending_items)) {
        return; // 沒有待處理商品。
    }

    // 4. 【正確邏輯】 找到了！我們現在直接呼叫 WC()->cart->add_to_cart()
    // 這個原生函式會自動處理堆疊（累加）到「即時 Session 購物車」。
    
    $cart_merged = false;
    foreach ($pending_items as $item) {
        $result_key = WC()->cart->add_to_cart($item->product_id, $item->quantity);
        if ($result_key) {
            $cart_merged = true;
        }
    }
    
    if ($cart_merged) {
        // 成功合併後，清除自訂資料表中的紀錄
        $wpdb->delete($table_name, array('tiktok_unique_id' => $tiktok_id), array('%s'));
        
        // (重要) 同步即時 Session 和永久購物車資料庫
        if ( is_object( WC()->cart ) ) {
            WC()->cart->persistent_cart_update();
        }
    }
}

// === 5. (已移除) ===
// 根據你的要求，我們不再監聽任何 Nextend 註冊/匹配鉤子 (這解決了崩潰問題)。


// === 6. 【v25.0 功能】 自動監聽 Nextend 解除綁定 (來自你的要求) ===
/**
 * 監聽 Nextend 官方的 'nsl_unlink_user' 鉤子。
 * 當 Nextend 移除它自己的 key 時，我們也同步移除 'tiktok_username'。
 */
add_action('nsl_unlink_user', 'livestream_handle_user_unlink_v25', 10, 3);

function livestream_handle_user_unlink_v25($user_id, $provider_id, $unlinked_social_id) {
    
    // 我們只關心 TikTok 的解除綁定
    if ($provider_id === 'tiktok') {
        
        // Nextend 移除了它自己的 Key，我們現在也必須移除 'tiktok_username'
        // (因為 Nextend 忘記移除了，所以我們幫它移除)
        delete_user_meta($user_id, 'tiktok_username');
    }
}

?>