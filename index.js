import memhelpers from 'cmem_helpers'
import * as BrowserFS from 'browserfs'

export const { Buffer } = BrowserFS.BFSRequire('buffer')

const WASI_ESUCCESS = 0
const WASI_EBADF = 8
const WASI_EIO = 29

const PREOPENTYPE_DIR = 0

const FILENO_STDIN = 0
const FILENO_STDOUT = 1
const FILENO_STDERR = 2

// this will maybe eventually be upstream
// https://github.com/jvilk/BrowserFS/issues/366
export const getFs = options => new Promise((resolve, reject) => {
  BrowserFS.configure(options, err => {
    if (err) {
      return reject(err)
    }
    resolve(BrowserFS.BFSRequire('fs'))
  })
})

export function setup (fs, stdout = console.log, stderr = console.error) {
  let instance

  const getDataView = () => {
    if (!instance?.exports?.memory) {
      throw new Error('You must set instance before calling anything that uses memory. It should export malloc and memory.')
    }
    return new DataView(instance.exports.memory.buffer)
  }

  const getSlice32 = (addr, len) => {
    if (!instance?.exports?.memory) {
      throw new Error('You must set instance before calling anything that uses memory. It should export malloc and memory.')
    }
    return new Uint32Array(instance?.exports?.memory?.buffer, addr, len)
  }

  const getHelpers = () => {
    if (!instance?.exports?.memory || !instance?.exports?.malloc) {
      throw new Error('You must set instance before calling anything that uses memory. It should export malloc and memory.')
    }
    return memhelpers(instance?.exports?.memory?.buffer, instance?.exports?.malloc)
  }

  const wasi = {
    _exited: false,
    _set_instance (i) {
      instance = i
    },

    // there is no real "exit" in wasm, but this will tell the user it exited.
    proc_exit (code) {
      stderr('exit ' + code)
      wasi._exited = true
      return 0
    },

    clock_res_get (clock_id) {
      if (clock_id !== 0) {
        return WASI_EINVAL
      }
      return 1000000000n
    },

    clock_time_get (clock_id, precision, memLoc) {
      if (clock_id !== 0) {
        return WASI_EINVAL
      }
      const dataView = new DataView(wasm.memory.buffer)
      dataView.setBigUint64(memLoc, BigInt(Date.now()) * (precision / 1000n), true)
    },

    random_get (bufPtr, buf_len) {
      const mem = new Uint8Array(wasm.memory.buffer)
      for (let i = 0; i <= buf_len; i++) {
        mem[bufPtr + i] = (Math.random() * 255) | 0
      }
    },

    fd_write (fd, iovsPtr, iovsLength, bytesWrittenPtr) {
      const dataView = getDataView()
      const { getString } = getHelpers()
      const iovs = getSlice32(iovsPtr, iovsLength * 2)
      let text = ''
      let totalBytesWritten = 0
      for (let i = 0; i < iovsLength * 2; i += 2) {
        const offset = iovs[i]
        const length = iovs[i + 1]
        const textChunk = getString(offset, length)
        text += textChunk
        totalBytesWritten += length
      }
      dataView.setInt32(bytesWrittenPtr, totalBytesWritten, true)

      if (fd === FILENO_STDOUT) {
        stdout(text)
      }

      if (fd === FILENO_STDERR) {
        stderr(text)
      }

      return WASI_ESUCCESS
    },

    fd_prestat_get (fd, bufPtr) {
      if (fd === 3) {
        const { struct } = getHelpers()
        const wasi_prestat = struct({
          type: 'Uint8',
          name_len: 'Uint32'
        })
        const ret = wasi_prestat({ type: PREOPENTYPE_DIR, name_len: 1 }, bufPtr)
        return WASI_ESUCCESS
      }
      return WASI_EBADF
    },

    fd_prestat_dir_name (fd, pathPtr, pathLen) {
      const { setString } = getHelpers()
      setString(pathPtr, '/')
      return 0
    },

    path_filestat_get (dirFd, flags, pathPtr, pathLen, retbufPtr) {
      try {
        const { struct, getString } = getHelpers()
        const f = fs.statSync(getString(pathPtr, pathLen))

        if (!f) {
          throw new Error('File not found.')
        }

        const wasi_filestat = struct({
          dev: 'BigUint64',
          ino: 'BigUint64',
          filetype: 'BigUint64',
          nlink: 'BigUint64',
          size: 'BigUint64',
          atim: 'BigUint64',
          mtim: 'BigUint64',
          ctim: 'BigUint64'
        })

        wasi_filestat({
          dev: BigInt(f.dev),
          ino: BigInt(f.ino),
          filetype: BigInt(f.isDirectory() ? 0 : 0), // TODO
          nlink: BigInt(f.nlink),
          size: BigInt(f.size),
          atim: BigInt(f.atime.getTime() / 1000 | 0),
          mtim: BigInt(f.mtime.getTime() / 1000 | 0),
          ctim: BigInt(f.ctime.getTime() / 1000 | 0)
        }, retbufPtr)

        return WASI_ESUCCESS
      } catch (e) {
        console.error(e)
        return WASI_EBADF
      }
    },

    // still working on these

    fd_read (...args) {
      console.log('fd_read', args)
      return 0
    },

    fd_seek (...args) {
      console.log('fd_seek', args)
      return 0
    },

    fd_close (...args) {
      console.log('fd_close', args)
      return 0
    },

    fd_seek (...args) {
      console.log('fd_seek', args)
      return 0
    },

    fd_close (...args) {
      console.log('fd_close', args)
      return 0
    },

    fd_fdstat_get (fd, bufPtr) {
      console.log('fd_fdstat_get', { fd, bufPtr })
      return 0
    },

    fd_fdstat_set_flags (...args) {
      console.log('fd_fdstat_set_flags', args)
      return 0
    },

    path_open (...args) {
      console.log('path_open', args)
      return 0
    }
  }

  return wasi
}
