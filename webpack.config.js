// node imports
const path = require('path');

// webpack imports
const nodeExternals = require('webpack-node-externals');

// server configuration
const serverConfig = {
    entry: {
        'index': './src/index.ts',
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.([cm]?ts|tsx)$/,
                use: {
                    loader: 'ts-loader'
                }
            }
        ]
    },
    resolve: {
        extensions: [
            '.ts',
            '.js'
        ]
    },
    output: {
        filename: '[name].ts',
        path: path.resolve(__dirname, 'lib'),
        library: {
            name: 'mango-parser',
            // universal library type
            // in future we can use ESM
            type: 'umd'
        },
        umdNamedDefine: true,
        clean: true
    },
    target: 'node',
    mode: 'production',
    externalsPresets: {
        node: true
    },
    externals: [
        nodeExternals()
    ]
};

module.exports = serverConfig;