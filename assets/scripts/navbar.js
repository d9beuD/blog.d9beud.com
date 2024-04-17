(() => {
    document.querySelectorAll('[data-collapse]').forEach((collapse) => {
        collapse.addEventListener('click', () => {
            const target = document.querySelector(collapse.getAttribute('data-collapse'))
            if (target.classList.contains('hidden')) {
                // It is already hidden
                target.classList.remove('hidden')
            } else {
                target.classList.add('hidden')
            }
        })
    })
})()