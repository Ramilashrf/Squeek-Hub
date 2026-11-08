chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('studio.html');
  const [existing] = await chrome.tabs.query({url});
  if (existing?.id != null) {
    await chrome.windows.update(existing.windowId,{focused:true});
    await chrome.tabs.update(existing.id,{active:true});
  } else {
    await chrome.tabs.create({url});
  }
});
