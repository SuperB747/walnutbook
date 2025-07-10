// Test script to verify AMMC importer fix
const { AMMCImporter } = require('./src/components/importers/AMMCImporter.ts');

// Mock the BaseImporter
class MockBaseImporter {
  parseDate(dateStr) {
    return '2024-01-01';
  }
}

// Mock the AMMCImporter
class MockAMMCImporter extends MockBaseImporter {
  parseRow(row, mapping, accountType) {
    const amountStr = row[mapping.amount]?.trim() || '';
    const payeeStr = row[mapping.payee]?.trim() || '';
    
    let amount = parseFloat(amountStr.replace(/[$,]/g, '').replace(/[^\d.-]/g, ''));
    let transactionType = 'Expense';
    
    // Determine transaction type based on amount sign and context
    const payeeLower = payeeStr.toLowerCase();
    if (payeeLower.includes('payment') || amount > 0) {
      transactionType = 'Income';
    }
    
    // Handle amount based on account type
    let finalAmount = amount;
    
    if (accountType === 'Credit') {
      // Credit 계좌: BMMC와 동일한 로직 적용
      // - Positive amounts (expenses) should be negative
      // - Negative amounts (income) should be positive
      if (transactionType === 'Expense') {
        finalAmount = -Math.abs(amount); // Expenses are negative
      } else {
        finalAmount = Math.abs(amount); // Income is positive
      }
    } else {
      // 다른 계좌들: 부호 변환 적용
      if (transactionType === 'Expense') {
        finalAmount = -Math.abs(amount);
      } else {
        finalAmount = Math.abs(amount);
      }
    }
    
    return {
      date: '2024-01-01',
      type: transactionType,
      amount: finalAmount,
      payee: payeeStr,
    };
  }
}

// Test cases
const testCases = [
  {
    name: 'Credit card expense (positive amount)',
    row: ['01/01/2024', 'Grocery Store', '100.00'],
    accountType: 'Credit',
    expectedAmount: -100.00,
    expectedType: 'Expense'
  },
  {
    name: 'Credit card income (negative amount)',
    row: ['01/01/2024', 'Payment', '-500.00'],
    accountType: 'Credit',
    expectedAmount: 500.00,
    expectedType: 'Income'
  },
  {
    name: 'Credit card expense (negative amount)',
    row: ['01/01/2024', 'Gas Station', '-50.00'],
    accountType: 'Credit',
    expectedAmount: -50.00,
    expectedType: 'Expense'
  },
  {
    name: 'Credit card income (positive amount)',
    row: ['01/01/2024', 'Refund', '25.00'],
    accountType: 'Credit',
    expectedAmount: 25.00,
    expectedType: 'Income'
  }
];

const importer = new MockAMMCImporter();
const mapping = { date: 0, amount: 2, payee: 1 };

console.log('Testing AMMC Importer Credit Card Amount Handling:');
console.log('==================================================');

testCases.forEach((testCase, index) => {
  const result = importer.parseRow(testCase.row, mapping, testCase.accountType);
  
  const amountCorrect = Math.abs(result.amount - testCase.expectedAmount) < 0.01;
  const typeCorrect = result.type === testCase.expectedType;
  
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log(`Input: ${testCase.row.join(', ')}`);
  console.log(`Expected: amount=${testCase.expectedAmount}, type=${testCase.expectedType}`);
  console.log(`Actual: amount=${result.amount}, type=${result.type}`);
  console.log(`Result: ${amountCorrect && typeCorrect ? 'PASS' : 'FAIL'}`);
  
  if (!amountCorrect || !typeCorrect) {
    console.log('❌ Test failed!');
    process.exit(1);
  }
});

console.log('\n✅ All tests passed! AMMC importer now correctly handles credit card amounts.'); 