/**
 * Zog.js Component Plugin
 * 
 * Provides an isolated component system.
 * Returns an API object containing `registerComponent`.
 */
export const ComponentPlugin = {
    install(api) {
        const { utils, addHook } = api;

        // The registry is scoped within this closure to ensure isolation per app instance.
        // This prevents global pollution and allows multiple apps to have different components.
        const componentRegistry = new Map();

        /**
         * Registers a component with a template.
         * Exposed via the plugin return value.
         * 
         * @param {string} name - The component tag name (without 'z-' prefix).
         * @param {object} options - Must contain a 'template' string.
         */
        const registerComponent = (name, options) => {
            if (!options.template) {
                console.warn(`Component "${name}" missing template.`);
                return;
            }
            componentRegistry.set(name, options);
        };

        // Hook into the compilation process to intercept custom tags
        addHook('beforeCompile', (el, scope, cs) => {
            // Ensure we are processing an element node
            if (el.nodeType !== 1) return; 

            const tagName = el.tagName.toLowerCase();
            const componentName = tagName.startsWith('z-') ? tagName.slice(2) : tagName;

            // Check if the tag matches a registered component
            if (componentRegistry.has(componentName)) {
                const def = componentRegistry.get(componentName);

                // 1. Create DOM element from the template string
                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = def.template.trim();
                const componentRoot = tempContainer.firstElementChild;

                if (!componentRoot) {
                    console.error(`Component "${componentName}" template must have a single root element.`);
                    return false; // Stop compilation on error
                }

                // 2. Slot Handling: Move original children into the template's <slot>
                const slot = componentRoot.querySelector('slot');
                if (slot) {
                    while (el.childNodes.length > 0) {
                        slot.parentNode.insertBefore(el.childNodes[0], slot);
                    }
                    slot.remove();
                } else {
                    // If no slot exists in template, discard original content
                    el.innerHTML = '';
                }

                // 3. Attribute Transfer: Merge classes/styles, copy others (props, events, directives)
                Array.from(el.attributes).forEach(attr => {
                    const { name, value } = attr;
                    if (name === 'class') {
                        componentRoot.classList.add(...value.split(' '));
                    } else if (name === 'style') {
                        componentRoot.style.cssText += ';' + value;
                    } else {
                        // Copy other attributes (e.g., z-if, @click)
                        componentRoot.setAttribute(name, value);
                    }
                });

                // 4. Replace the original <z-component> with the rendered template
                el.replaceWith(componentRoot);

                // 5. Manually compile the new component root (since we swapped it in)
                utils.compile(componentRoot, scope, cs);

                // Return FALSE: Stop the main compiler from processing the *original* node 
                // (because it has been removed from the DOM).
                return false; 
            }

            // Return TRUE: Allow the main compiler to continue processing standard elements.
            return true; 
        });

        // Return the API object.
        // Usage: const { registerComponent } = app.use(ComponentPlugin);
        return { registerComponent };
    }
};
