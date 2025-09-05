// 監聽使用者點擊瀏覽器右上角的擴充功能圖示的事件
chrome.action.onClicked.addListener((tab) => {
  // 當圖示被點擊時，在當前的分頁打開側邊面板
  chrome.sidePanel.open({ tabId: tab.id });
});