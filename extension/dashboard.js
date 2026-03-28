document.getElementById('sellerDetails').innerText = 'Seller Details';
document.getElementById('totalMoneySaved').innerText = '$10,000 Saved';
document.getElementById('currentActiveOrders').innerText = '5 Active Orders';

fetch('/api/orders', {
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('user')}`
    }
}).then(response => response.json())
  .then(data => {
      const orderHistory = document.getElementById('orderHistory');
      data.orders.forEach(order => {
          const div = document.createElement('div');
          div.innerText = `${order.id} - ${order.status}`;
          orderHistory.appendChild(div);
      });
  });
