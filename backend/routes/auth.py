from flask import Blueprint, jsonify, request
from models.user import User

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data['username']
    password = data['password']

    # Validate credentials (simulated).
    user = User.query.filter_by(username=username, password=password).first()
    if user:
        token = user.generate_token()
        return jsonify({'message': 'Login successful', 'token': token}), 200
    return jsonify({'message': 'Invalid credentials'}), 401


@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    # Logout logic here.
    return jsonify({'message': 'Logout successful'}), 200