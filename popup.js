async function promptMasterPassword() {
    let output = await chrome.storage.local.get('masterPassword');
    if (!output.masterPassword) {
        document.getElementById('submitMasterPassword').addEventListener('click', async () => {
            const prompted = document.getElementById('masterPasswordInput').value;

            if (!prompted) return document.getElementById('output').textContent = 'Master password is required to continue.';
            let response = await chrome.runtime.sendMessage({ action: 'masterPassword', masterPassword: prompted });
            document.getElementById('output').textContent = response.success ? 'Successfully set password.' : response.error || 'Error setting master password.';

            if (response.success) {
                document.getElementById('container').style.display = 'block';
                document.getElementById('passwordContainer').style.display = 'none';
            }
        });
    } else {
        document.getElementById('passwordContainer').style.display = 'none';
        document.getElementById('container').style.display = 'block';
    }
}

function getCurrentTabDomain() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                resolve(new URL(tabs[0].url).hostname.replace('www.', ''));
            } else {
                resolve(null);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await promptMasterPassword();
    loadAccounts();
});

document.getElementById('save').addEventListener('click', async () => {
    let url = await getCurrentTabDomain();
    let account = document.getElementById('account').value.trim();
    let password = document.getElementById('password').value;
    let masterPassword = document.getElementById('masterPassword').value;

    if (!account || !password || !masterPassword) {
        document.getElementById('output').textContent = 'Missing fields.';
        return;
    }

    chrome.runtime.sendMessage({ action: 'store', url, account, password, masterPassword }, (response) => {
        document.getElementById('output').textContent = response.success ? 'Password saved!' : response.error || 'Error saving password.';
        if (response.success) loadAccounts();
    });
});

document.getElementById('retrieve').addEventListener('click', async () => {
    let url = await getCurrentTabDomain();
    let account = document.getElementById('account').value.trim();
    let masterPassword = document.getElementById('masterPassword').value;

    if (!account || !masterPassword) {
        document.getElementById('output').textContent = 'Missing fields.';
        return;
    }

    chrome.runtime.sendMessage({ action: 'retrieve', url, account, masterPassword }, (response) => {
        document.getElementById('output').textContent = response.success ? `Password: ${response.password}` : response.error || 'Error retrieving password.';
    });
});

function loadAccounts() {
    chrome.runtime.sendMessage({ action: 'getAllAccounts' }, (response) => {
        if (response.success) {
            let accountList = document.getElementById('accountList');
            accountList.innerHTML = '';
            response.accounts.forEach(({ url, account }) => {
                let li = document.createElement('li');
                li.textContent = `${account} (${url})`;

                let deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'X';
                deleteBtn.className = 'delete-btn';
                deleteBtn.onclick = () => deleteAccount(url, account);

                li.appendChild(deleteBtn);
                accountList.appendChild(li);
            });
        }
    });
}

document.getElementById('deleteAll').addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all saved passwords?')) {
        chrome.runtime.sendMessage({ action: 'deleteAll' }, (response) => {
            document.getElementById('output').textContent = response.success ? 'All passwords deleted!' : response.error || 'Error deleting passwords.';
            if (response.success) loadAccounts();
        });
    }
});

function deleteAccount(url, account) {
    chrome.runtime.sendMessage({ action: 'delete', url, account }, (response) => {
        document.getElementById('output').textContent = response.success ? 'Account deleted!' : response.error || 'Error deleting account.';
        if (response.success) loadAccounts();
    });
}
