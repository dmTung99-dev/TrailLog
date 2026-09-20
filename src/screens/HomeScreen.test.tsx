import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { HomeScreen } from './HomeScreen';
import { useNavigation } from '@react-navigation/native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

describe('HomeScreen', () => {
  it('navigates to Tracking when "Track" is pressed', () => {
    const navigate = jest.fn();
    (useNavigation as jest.Mock).mockReturnValue({ navigate });

    render(<HomeScreen />);
    fireEvent.press(screen.getByText('Track'));

    expect(navigate).toHaveBeenCalledWith('Tracking');
  });

  it('navigates to History when "History" is pressed', () => {
    const navigate = jest.fn();
    (useNavigation as jest.Mock).mockReturnValue({ navigate });

    render(<HomeScreen />);
    fireEvent.press(screen.getByText('History'));

    expect(navigate).toHaveBeenCalledWith('History');
  });
});
