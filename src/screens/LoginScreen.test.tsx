import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';
import { useAuthStore } from '../store/authStore';

jest.mock('../store/authStore');

describe('LoginScreen', () => {
  it('calls login with the entered email and password when Log In is pressed', async () => {
    const login = jest.fn().mockResolvedValue(undefined);
    (useAuthStore as unknown as jest.Mock).mockReturnValue({ login });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByText('Log In'));

    await waitFor(() => expect(login).toHaveBeenCalledWith('a@example.com', 'password123'));
  });

  it('shows an error message when login rejects', async () => {
    const login = jest.fn().mockRejectedValue(new Error('Invalid email or password'));
    (useAuthStore as unknown as jest.Mock).mockReturnValue({ login });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(screen.getByText('Log In'));

    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy());
  });
});
