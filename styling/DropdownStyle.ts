import { StyleSheet } from 'react-native';

export const dropdownStyles = StyleSheet.create({
    input: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#333',
    },
    dropdown: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 8,
        maxHeight: 200,
        marginTop: 5,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    list: {
        maxHeight: 200,
    },
    item: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
    },
    itemId: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    itemName: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    selectedText: {
        fontSize: 14,
        color: '#007AFF',
        marginTop: 5,
        fontWeight: '500',
    },
});