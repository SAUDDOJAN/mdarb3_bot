import https from 'https';
https.get('https://www.youtube.com/@mdarb3', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/itemprop="channelId" content="([^"]+)"/);
    if (match) {
      console.log("Channel ID:", match[1]);
    } else {
      console.log("Channel ID not found.");
    }
  });
});
