// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'speedUpdated') {
    updateBadgeForTab(sender.tab.id, message.speed)
  }
})

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // 延迟执行以确保content script已加载
    setTimeout(() => {
      checkVideoAndUpdateBadge(tabId)
    }, 1000)
  }
})

// 监听标签页激活
chrome.tabs.onActivated.addListener((activeInfo) => {
  checkVideoAndUpdateBadge(activeInfo.tabId)
})

// 检查视频并更新badge
function checkVideoAndUpdateBadge(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, { action: 'hasVideo' }, (response) => {
      if (chrome.runtime.lastError) {
        // 清除badge并忽略错误
        chrome.action.setBadgeText({ text: '', tabId })
        return
      }

      if (response && response.exists) {
        chrome.tabs.sendMessage(
          tabId,
          { action: 'getSpeed' },
          (speedResponse) => {
            if (speedResponse && speedResponse.speed) {
              updateBadgeForTab(tabId, speedResponse.speed)
            }
          }
        )
      } else {
        chrome.action.setBadgeText({ text: '', tabId })
      }
    })
  } catch (error) {
    console.error('Error checking video:', error)
    chrome.action.setBadgeText({ text: '', tabId })
  }
}

// 更新特定标签页的badge
function updateBadgeForTab(tabId, speed) {
  chrome.action.setBadgeText({
    text: `${speed}x`,
    tabId
  })
  chrome.action.setBadgeBackgroundColor({
    color: '#4CAF50',
    tabId
  })
}
