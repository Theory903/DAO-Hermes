#!/usr/bin/env node
// set-exe-identity.cjs — stamp the DAO icon + version metadata onto the
// built DAO.exe using resedit (Electron's maintained rcedit successor),
// completely decoupled from electron-builder's signing path.
//
// WHY THIS EXISTS
// ---------------
// apps/DAO-desktop/package.json sets build.win.signAndEditExecutable=false.
// That flag is load-bearing: turning electron-builder's own exe-editing ON also
// re-enables its signtool step, which fetches winCodeSign-2.6.0.7z, whose
// macOS symlinks crash 7-Zip on non-admin Windows (no Developer Mode = no
// SeCreateSymbolicLinkPrivilege). That is an unfixable dead end — we do NOT
// try to extract winCodeSign.
//
// The cost of disabling signAndEditExecutable is that electron-builder also
// skips its PE editor, so the unpacked DAO.exe keeps the stock Electron
// icon and "Electron" taskbar name. This script restores the icon + identity
// by calling resedit DIRECTLY. resedit is a pure PE resource editor: no
// signing, no certs, no winCodeSign, no symlinks.
//
// HOW IT RUNS
// -----------
// Primarily as an electron-builder `afterPack` hook (scripts/after-pack.cjs),
// so EVERY packed build gets a branded exe from one place.
//
// Also runnable standalone for ad-hoc re-stamping:
//   node scripts/set-exe-identity.cjs <path-to-DAO.exe>
//
// Exits 0 on success, non-zero on failure when run as a CLI. As a hook,
// stampExeIdentity() resolves on success and rejects on failure; the caller
// (after-pack.cjs) swallows the rejection so a stamp failure never fails an
// otherwise-good build (worst case: stock icon, not a broken app).

const path = require('node:path')
const fs = require('node:fs')

const ResEdit = require('resedit')

const IDENTITY = {
  productName: 'DAO OS',
  fileDescription: 'DAO OS',
  companyName: 'Nous Research',
  legalCopyright: 'Copyright (c) 2026 Nous Research',
}

// Stamp the DAO icon + identity onto `exe`. Resolves on success, throws on
// failure. `desktopRoot` defaults to this script's package root so the icon and
// the resedit dependency resolve regardless of cwd.
async function stampExeIdentity(exe, desktopRoot = path.resolve(__dirname, '..')) {
  if (!exe || !fs.existsSync(exe)) {
    throw new Error(`target exe not found: ${exe}`)
  }

  const icon = path.join(desktopRoot, 'assets', 'icon.ico')
  if (!fs.existsSync(icon)) {
    throw new Error(`icon not found: ${icon}`)
  }

  console.log(`[set-exe-identity] stamping ${exe}`)
  console.log(`[set-exe-identity] icon: ${icon}`)

  const data = fs.readFileSync(exe)
  const executable = ResEdit.NtExecutable.from(data, { ignoreCert: true })
  const resource = ResEdit.NtExecutableResource.from(executable)

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icon))
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries)
  const iconGroupId = iconGroups.length > 0 ? iconGroups[0].id : 1
  const iconLang = iconGroups.length > 0 ? iconGroups[0].lang : 1033

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resource.entries,
    iconGroupId,
    iconLang,
    iconFile.icons.map(item => item.data),
  )

  const versionInfoList = ResEdit.Resource.VersionInfo.fromEntries(resource.entries)
  const versionInfo = versionInfoList[0]
  if (versionInfo) {
    const languages = versionInfo.getAllLanguagesForStringValues()
    const lang = languages[0] ?? { lang: 1033, codepage: 1200 }
    versionInfo.setStringValues(lang, {
      ProductName: IDENTITY.productName,
      FileDescription: IDENTITY.fileDescription,
      CompanyName: IDENTITY.companyName,
      LegalCopyright: IDENTITY.legalCopyright,
    })
    versionInfo.outputToResourceEntries(resource.entries)
  }

  resource.outputResource(executable)
  fs.writeFileSync(exe, Buffer.from(executable.generate()))

  console.log('[set-exe-identity] done — DAO icon + identity stamped')
}

module.exports = { stampExeIdentity }

// CLI entry point: `node scripts/set-exe-identity.cjs <exe>`.
if (require.main === module) {
  const exe = process.argv[2]
  if (!exe) {
    console.error('[set-exe-identity] usage: set-exe-identity.cjs <path-to-exe>')
    process.exit(2)
  }
  stampExeIdentity(exe).catch(err => {
    console.error(`[set-exe-identity] ${err.message}`)
    process.exit(1)
  })
}
