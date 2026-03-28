document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    }).then(response => response.json())
      .then(data => {
          if (data.message === "Login successful") {
              chrome.runtime.sendMessage({ action: "login", user: data.token });
              window.close();
          } else {
              alert('Invalid credentials');
          }
      });
});
