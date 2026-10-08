const ftp = require('basic-ftp');
const path = require('path');

async function deploy() {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  client.timeout = 20000;

  try {
    console.log('Connecting to Hostinger via standard FTP (Port 21)...');
    await client.access({
      host: '185.232.14.208',
      user: 'u880916130',
      password: 'RAJOURIgarden@1996',
      port: 21,
      secure: false,
    });

    console.log('FTP Connected successfully!');
    const list = await client.list();
    console.log('Remote root directory contents:', list.map(f => f.name));

    let remoteDir = 'public_html';
    // Check if domains folder exists
    const hasDomains = list.some(f => f.name === 'domains');
    if (hasDomains) {
      await client.cd('domains');
      const domainsList = await client.list();
      console.log('Domains list:', domainsList.map(f => f.name));
      if (domainsList.some(f => f.name === 'roofingclients.us')) {
        remoteDir = 'domains/roofingclients.us/public_html';
      }
      await client.cdup();
    }

    console.log(`Target remote directory: ${remoteDir}`);
    await client.cd(remoteDir);

    console.log('Uploading public folder contents...');
    const localPublic = path.join(__dirname, '..', 'public');
    await client.uploadFromDir(localPublic);

    console.log('✅ DEPLOYMENT COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('FTP Deployment Error:', err.message);
  } finally {
    client.close();
  }
}

deploy();
