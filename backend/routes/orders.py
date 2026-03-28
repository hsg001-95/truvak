from flask import Blueprint, jsonify, request
from models.order import Order
import random

orders_bp = Blueprint('orders', __name__)

@orders_bp.route('/api/orders', methods=['GET'])
def get_orders():
    auth_header = request.headers.get('Authorization', '')
    user_id = auth_header.split(' ')[1] if ' ' in auth_header else ''

    # Fetch user-specific orders from the database.
    orders = Order.query.filter_by(user_id=user_id).all()

    order_states = ["Pending", "Shipped", "Delivered", "Returned", "Canceled"]
    order_colors = {
        "Pending": "#FFC107",
        "Shipped": "#4CAF50",
        "Delivered": "#4CAF50",
        "Returned": "#F44336",
        "Canceled": "#9E9E9E"
    }

    for order in orders:
        order.status = random.choice(order_states)
        order.color = order_colors[order.status]

    return jsonify({'orders': [order.to_dict() for order in orders]})