import { setup, getFs, Buffer } from '.'
import { readFile } from 'fs/promises'

const fs = await getFs({
  fs: 'ZipFS',
  options: {
    zipData: Buffer.from(await readFile('example/simple.zip'))
  }
})

test('simple', async () => {
  const stdout = []
  const stderr = []
  const handleStdErr = t => stderr.push(t)
  const handleStdOut = t => stdout.push(t)

  const wasi_snapshot_preview1 = setup(fs, handleStdErr, handleStdOut)
  const { instance } = await WebAssembly.instantiate(await readFile('example/simple.wasm'), { wasi_snapshot_preview1 })
  wasi_snapshot_preview1._set_instance(instance)
  wasi_snapshot_preview1._stdin = 'here is some test text\n'
  instance.exports._start()
  expect(stdout).toMatchSnapshot()
  expect(stderr).toMatchSnapshot()
})
