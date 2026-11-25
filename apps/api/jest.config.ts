if (process.versions.node.split('.')[0] !== '22') {
    throw new Error(`Backend unit tests require Node.js 22.x. Current version: ${process.version}. Switch to Node 22 and retry.`);
}

export default {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    collectCoverageFrom: [
        'src/**/*.(t|j)s',
        '!src/**/*.spec.ts',
        '!src/main.ts',
    ],
    coverageDirectory: './coverage',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
        '^prisma/(.*)$': '<rootDir>/prisma/$1',
    },
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
    ],
};
