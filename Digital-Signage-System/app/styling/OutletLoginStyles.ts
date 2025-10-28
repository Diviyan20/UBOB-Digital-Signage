import { StyleSheet } from 'react-native';

export const OutletLoginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 180,
    height: 80,
    marginBottom: 50,
  },
  formContainer: {
    width: '100%',
    alignItems: 'center',
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 16,
    color: '#333333',
    fontWeight: '500',
    marginBottom: 6,
    marginLeft: 10,
  },
  input: {
    width: '100%',
    borderWidth: 2,
    borderColor: '#FFE24A',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 20,
    color: '#333',
  },
  loginButton: {
    backgroundColor: '#FFE24A',
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  loginButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
