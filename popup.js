// 获取当前标签页的播放速度并更新UI
function updateSpeedButtons(currentSpeed) {
  // 移除所有按钮的active类
  document.querySelectorAll('.preset-speeds button').forEach((button) => {
    button.classList.remove('active')
    // 如果按钮的速度值与当前速度相匹配，添加active类
    if (parseFloat(button.dataset.speed) === currentSpeed) {
      button.classList.add('active')
    }
  })
  document.getElementById('customSpeedInput').value = currentSpeed.toFixed(2)
}

// 获取当前标签页的播放速度
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  if (tabs[0]) {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: 'getSpeed' },
      function (response) {
        if (chrome.runtime.lastError) {
          console.log('Error:', chrome.runtime.lastError.message)
          // 使用默认速度
          updateSpeedButtons(1.0)
          return
        }
        if (response && response.speed) {
          updateSpeedButtons(response.speed)
        }
      }
    )
  }
})

// 重置按钮点击事件
document.querySelector('.reset-button').addEventListener('click', function () {
  const defaultSpeed = 1.0
  setVideoSpeed(defaultSpeed)
  updateSpeedButtons(defaultSpeed)
})

// 预设速度按钮点击事件
document.querySelectorAll('.preset-speeds button').forEach((button) => {
  button.addEventListener('click', function () {
    const speed = parseFloat(this.dataset.speed)
    setVideoSpeed(speed)
    updateSpeedButtons(speed)
  })
})

// 步进器按钮点击事件 - 小步进（0.1）
document.querySelector('.decrease').addEventListener('click', function () {
  const currentValue = parseFloat(
    document.getElementById('customSpeedInput').value
  )
  const newSpeed = Math.max(0.1, Math.round((currentValue - 0.1) * 100) / 100)
  setVideoSpeed(newSpeed)
  updateSpeedButtons(newSpeed)
})

document.querySelector('.increase').addEventListener('click', function () {
  const currentValue = parseFloat(
    document.getElementById('customSpeedInput').value
  )
  const newSpeed = Math.min(16, Math.round((currentValue + 0.1) * 100) / 100)
  setVideoSpeed(newSpeed)
  updateSpeedButtons(newSpeed)
})

// 步进器按钮点击事件 - 大步进（1.0）
document.querySelector('.decrease-fast').addEventListener('click', function () {
  const currentValue = parseFloat(
    document.getElementById('customSpeedInput').value
  )
  const newSpeed = Math.max(0.1, Math.round((currentValue - 1.0) * 100) / 100)
  setVideoSpeed(newSpeed)
  updateSpeedButtons(newSpeed)
})

document.querySelector('.increase-fast').addEventListener('click', function () {
  const currentValue = parseFloat(
    document.getElementById('customSpeedInput').value
  )
  const newSpeed = Math.min(16, Math.round((currentValue + 1.0) * 100) / 100)
  setVideoSpeed(newSpeed)
  updateSpeedButtons(newSpeed)
})

// 设置视频速度
function setVideoSpeed(speed) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action: 'setSpeed',
          speed: speed
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error:', chrome.runtime.lastError.message)
            // 可能是在不支持的页面上
            return
          }
        }
      )
    }
  })
}

// 添加自定义速度输入事件
document
  .getElementById('customSpeedInput')
  .addEventListener('change', function () {
    const speed = parseFloat(this.value)
    if (!isNaN(speed) && speed >= 0.1 && speed <= 16) {
      const roundedSpeed = Math.round(speed * 100) / 100
      setVideoSpeed(roundedSpeed)
      updateSpeedButtons(roundedSpeed)
    }
  })

// 移除 readonly 属性，允许用户直接输入
document.getElementById('customSpeedInput').removeAttribute('readonly')
