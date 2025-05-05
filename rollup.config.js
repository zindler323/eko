import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs.js',
        format: 'cjs'
      }
    ],
    external: ['dotenv'],
    plugins: [
      commonjs(),
      resolve({
        preferBuiltins: true,
      }),
      typescript()
    ]
  },
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.esm.js',
        format: 'esm'
      }
    ],
    external: ['dotenv', 'buffer'],
    plugins: [
      commonjs(),
      resolve({
        browser: true,
        preferBuiltins: true,
      }),
      typescript()
    ]
  }
];