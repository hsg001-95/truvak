import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import Overview from '../pages/Overview';

vi.mock('../services/api', () => ({
  getActiveMerchantId: vi.fn(() => 'merchant_amazon'),
  getOrders: vi.fn(async () => [
    {
      id: 'ORD-1',
      score: 92,
      risk_level: 'LOW',
      recommended_action: 'Approve',
      order_value: 1200,
      pin_code: '560001',
    },
    {
      id: 'ORD-2',
      score: 31,
      risk_level: 'HIGH',
      recommended_action: 'Block',
      order_value: 2400,
      pin_code: '110001',
    },
    {
      id: 'ORD-3',
      score: 65,
      risk_level: 'MEDIUM',
      recommended_action: 'Review',
      order_value: 900,
      pin_code: '400001',
    },
  ]),
}));

describe('Overview page', () => {
  test('renders computed metrics and alerts from API orders', async () => {
    render(<Overview />);

    expect(screen.getByText(/Loading overview/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Rs 4,500')).toBeInTheDocument();
    });

    expect(screen.getByText('Orders Scored')).toBeInTheDocument();
    expect(screen.getByText('High Risk Alerts')).toBeInTheDocument();
    expect(screen.getByText('Average Trust Score')).toBeInTheDocument();
    expect(screen.getByText('Recent Risk Alerts')).toBeInTheDocument();
    expect(screen.getByText('Risk Distribution')).toBeInTheDocument();
    expect(screen.getByText(/Order ORD-2/i)).toBeInTheDocument();
    expect(screen.getByText(/Order ORD-3/i)).toBeInTheDocument();
  });
});
