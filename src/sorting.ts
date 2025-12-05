import type { TransformerEnv } from './types'
import { bigSign } from './utils'

function reorderClasses(classList: string[], { env }: { env: TransformerEnv }) {
  let orderedClasses = env.context.getClassOrder(classList)

  return orderedClasses.sort(([nameA, a], [nameZ, z]) => {
    // Move `...` to the end of the list
    if (nameA === '...' || nameA === '…') return 1
    if (nameZ === '...' || nameZ === '…') return -1

    if (a === z) return 0
    if (a === null) return -1
    if (z === null) return 1
    return bigSign(a - z)
  })
}

export type ClassCategory =
  | 'layout-display'
  | 'layout-position'
  | 'flex-grid'
  | 'spacing'
  | 'sizing'
  | 'typography'
  | 'backgrounds'
  | 'borders'
  | 'effects'
  | 'filters'
  | 'transitions'
  | 'transforms'
  | 'interactivity'
  | 'other'

const multilineCategoryTests: { category: ClassCategory; pattern: RegExp }[] = [
  { category: 'layout-display', pattern: /^(block|inline|flex|grid|table|contents|hidden|static|fixed|absolute|relative|sticky)$/ },
  { category: 'layout-position', pattern: /^(isolate|z-|top|right|bottom|left|visible|invisible|overflow|overscroll|object|inset)/ },
  { category: 'flex-grid', pattern: /^(flex-|justify-|items-|content-|self-|order-|place-|grow|shrink|basis)/ },
  { category: 'flex-grid', pattern: /^(grid-|col-|row-|gap-|auto-cols|auto-rows)/ },
  { category: 'spacing', pattern: /^(p-|px-|py-|pt-|pr-|pb-|pl-|m-|mx-|my-|mt-|mr-|mb-|ml-|space-)/ },
  { category: 'sizing', pattern: /^(w-|h-|min-|max-|size-|aspect-)/ },
  { category: 'typography', pattern: /^(font-|text-|antialiased|subpixel|italic|not-italic|normal-case|uppercase|lowercase|capitalize|tracking-|leading-|align-|whitespace-|break-|hyphens-|content-|decoration-|underline|overline|line-through|no-underline|list-|indent-)/ },
  { category: 'backgrounds', pattern: /^(bg-|gradient-|from-|via-|to-)/ },
  { category: 'borders', pattern: /^(rounded|border|divide|ring|outline|stroke|fill)/ },
  { category: 'effects', pattern: /^(shadow|opacity|mix-|blend-|box-decoration|box-slice)/ },
  { category: 'filters', pattern: /^(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|backdrop-)/ },
  { category: 'transitions', pattern: /^(transition|duration|ease|delay|animate-)/ },
  { category: 'transforms', pattern: /^(scale|rotate|translate|skew|origin-)/ },
  { category: 'interactivity', pattern: /^(cursor-|pointer-|resize|scroll-|select-|touch-|will-change|accent-|appearance-|caret-)/ },
]

export function getBaseClassName(cls: string): string {
  let depth = 0
  let lastColon = -1

  for (let i = 0; i < cls.length; i++) {
    let char = cls[i]

    if (char === '[') depth++
    else if (char === ']' && depth > 0) depth--
    else if (char === ':' && depth === 0) lastColon = i
  }

  return cls.slice(lastColon + 1)
}

export function categorizeClass(cls: string): ClassCategory {
  let base = getBaseClassName(cls)

  for (let { category, pattern } of multilineCategoryTests) {
    if (pattern.test(base)) return category
  }

  return 'other'
}

export function groupForMultiline(classList: string[]) {
  let groups: { category: ClassCategory; classes: string[] }[] = []

  for (let cls of classList) {
    let category = categorizeClass(cls)

    let last = groups[groups.length - 1]
    if (last && last.category === category) {
      last.classes.push(cls)
    } else {
      groups.push({ category, classes: [cls] })
    }
  }

  return groups
}

export function sortClasses(
  classStr: string,
  {
    env,
    ignoreFirst = false,
    ignoreLast = false,
    removeDuplicates = true,
    collapseWhitespace = { start: true, end: true },
  }: {
    env: TransformerEnv
    ignoreFirst?: boolean
    ignoreLast?: boolean
    removeDuplicates?: boolean
    collapseWhitespace?: false | { start: boolean; end: boolean }
  },
): string {
  if (typeof classStr !== 'string' || classStr === '') {
    return classStr
  }

  // Ignore class attributes containing `{{`, to match Prettier behaviour:
  // https://github.com/prettier/prettier/blob/8a88cdce6d4605f206305ebb9204a0cabf96a070/src/language-html/embed/class-names.js#L9
  if (classStr.includes('{{')) {
    return classStr
  }

  if (env.options.tailwindPreserveWhitespace) {
    collapseWhitespace = false
  }

  // This class list is purely whitespace
  // Collapse it to a single space if the option is enabled
  if (/^[\t\r\f\n ]+$/.test(classStr) && collapseWhitespace) {
    return ' '
  }

  let result = ''
  let parts = classStr.split(/([\t\r\f\n ]+)/)
  let classes = parts.filter((_, i) => i % 2 === 0)
  let whitespace = parts.filter((_, i) => i % 2 !== 0)

  if (classes[classes.length - 1] === '') {
    classes.pop()
  }

  if (collapseWhitespace) {
    whitespace = whitespace.map(() => ' ')
  }

  let prefix = ''
  if (ignoreFirst) {
    prefix = `${classes.shift() ?? ''}${whitespace.shift() ?? ''}`
  }

  let suffix = ''
  if (ignoreLast) {
    suffix = `${whitespace.pop() ?? ''}${classes.pop() ?? ''}`
  }

  let { classList, removedIndices } = sortClassList(classes, {
    env,
    removeDuplicates,
  })

  // Remove whitespace that appeared before a removed classes
  whitespace = whitespace.filter((_, index) => !removedIndices.has(index + 1))

  let shouldMultiline =
    env.options.tailwindMultilineClasses &&
    !ignoreFirst &&
    !ignoreLast &&
    collapseWhitespace !== false &&
    classList.length >= (env.options.tailwindMultilineMinClassCount ?? 5)

  if (shouldMultiline) {
    let grouped = groupForMultiline(classList)
    let lines = grouped.map(({ classes }) => classes.join(' '))

    if (collapseWhitespace) {
      prefix = prefix.replace(/\s+$/g, ' ')
      suffix = suffix.replace(/^\s+/g, ' ')
    }

    return prefix + lines.join('\n') + suffix
  }

  for (let i = 0; i < classList.length; i++) {
    result += `${classList[i]}${whitespace[i] ?? ''}`
  }

  if (collapseWhitespace) {
    prefix = prefix.replace(/\s+$/g, ' ')
    suffix = suffix.replace(/^\s+/g, ' ')

    result = result
      .replace(/^\s+/, collapseWhitespace.start ? '' : ' ')
      .replace(/\s+$/, collapseWhitespace.end ? '' : ' ')
  }

  return prefix + result + suffix
}

export function sortClassList(
  classList: string[],
  {
    env,
    removeDuplicates,
  }: {
    env: TransformerEnv
    removeDuplicates: boolean
  },
) {
  // Re-order classes based on the Tailwind CSS configuration
  let orderedClasses = reorderClasses(classList, { env })

  // Remove duplicate Tailwind classes
  if (env.options.tailwindPreserveDuplicates) {
    removeDuplicates = false
  }

  let removedIndices = new Set<number>()

  if (removeDuplicates) {
    let seenClasses = new Set<string>()

    orderedClasses = orderedClasses.filter(([cls, order], index) => {
      if (seenClasses.has(cls)) {
        removedIndices.add(index)
        return false
      }

      // Only consider known classes when removing duplicates
      if (order !== null) {
        seenClasses.add(cls)
      }

      return true
    })
  }

  return {
    classList: orderedClasses.map(([className]) => className),
    removedIndices,
  }
}
