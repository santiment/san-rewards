
mkdir flattens
npx truffle-flattener ./contracts/mock/RealTokenMock.sol > flattens/RealTokenMock.sol
npx truffle-flattener ./contracts/RewardItems.sol > flattens/RewardItems.sol
npx truffle-flattener ./contracts/RewardsDistributor.sol > flattens/RewardsDistributor.sol
npx truffle-flattener ./contracts/RewardsToken.sol > flattens/RewardsToken.sol
npx truffle-flattener ./contracts/hunters/WalletHunters.sol > flattens/WalletHunters.sol
npx truffle-flattener ./contracts/gsn/TrustedForwarder.sol > flattens/TrustedForwarder.sol
