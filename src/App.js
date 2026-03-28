import React from 'react';
import OrderList from './OrderList';
import LoginModal from './LoginModal';

class App extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isLoggedIn: false,
            user: null,
            orders: []
        };
    }

    login = (user) => {
        this.setState({ isLoggedIn: true, user });
        localStorage.setItem('user', JSON.stringify(user));
        this.fetchOrders();
    };

    logout = () => {
        this.setState({ isLoggedIn: false, user: null, orders: [] });
        localStorage.removeItem('user');
    };

    fetchOrders = async () => {
        const response = await fetch('/v1/orders', {
            headers: { 'Authorization': `Bearer ${this.state.user.token}` }
        });
        const data = await response.json();
        this.setState({ orders: data.orders });
    };

    componentDidMount() {
        if (localStorage.getItem('user')) {
            const user = JSON.parse(localStorage.getItem('user'));
            this.setState({ isLoggedIn: true, user }, () => this.fetchOrders());
        }
    }

    render() {
        return (
            <div className="App">
                {this.state.isLoggedIn ? (
                    <OrderList orders={this.state.orders} />
                ) : (
                    <LoginModal login={this.login} />
                )}
            </div>
        );
    }
}

export default App;