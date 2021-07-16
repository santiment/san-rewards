// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

library UintBitmap {
    struct Bitmap {
        mapping(uint256 => uint256) map;
    }

    function isSet(Bitmap storage bitmap, uint256 index)
        internal
        view
        returns (bool)
    {
        uint256 wordIndex = index / 256;
        uint256 word = bitmap.map[wordIndex];
        uint256 bitIndex = index % 256;
        return word | (1 << bitIndex) == word;
    }

    function set(Bitmap storage bitmap, uint256 index) internal {
        uint256 wordIndex = index / 256;
        uint256 word = bitmap.map[wordIndex];
        uint256 bitIndex = index % 256;
        bitmap.map[wordIndex] = word | (1 << bitIndex);
    }
}
