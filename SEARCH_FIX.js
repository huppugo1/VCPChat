// 将此函数添加到 renderer.js 中 setupTopicsRefreshButton 函数之后

// 设置所有搜索框的事件监听
function setupSearchInputs() {
  // Agent 搜索
  const agentSearchInput = document.getElementById('agentSearchInput');
  if (agentSearchInput) {
    agentSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      const agentList = document.getElementById('agentList');
      if (!agentList) return;
      
      const items = agentList.querySelectorAll('li');
      items.forEach(item => {
        const nameElement = item.querySelector('.agent-name');
        if (nameElement) {
          const name = nameElement.textContent.toLowerCase();
          item.style.display = name.includes(searchTerm) ? '' : 'none';
        }
      });
    });
  }

  // 群组搜索
  const groupSearchInput = document.getElementById('groupSearchInput');
  if (groupSearchInput) {
    groupSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      const groupList = document.getElementById('groupList');
      if (!groupList) return;
      
      const items = groupList.querySelectorAll('li');
      items.forEach(item => {
        const nameElement = item.querySelector('.group-name');
        if (nameElement) {
          const name = nameElement.textContent.toLowerCase();
          item.style.display = name.includes(searchTerm) ? '' : 'none';
        }
      });
    });
  }

  // 话题搜索
  const topicSearchInput = document.getElementById('topicSearchInput');
  if (topicSearchInput) {
    topicSearchInput.addEventListener('input', async () => {
      await loadAllTopics();
    });
  }
}

// 然后在 DOMContentLoaded 中调用（约第2147行）：
// setupSearchInputs();
