import { expect, it, describe } from "bun:test";
import {addNumbers} from './addNumbers';

describe(addNumbers.name, () => {
    it('should add two numbers', () => {
        expect(addNumbers(1, 2)).toBe(3);
    });
});