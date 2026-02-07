import React from 'react'
import Link from "next/link"
const page = () => {
  return (
    <div>
      <Link href="/signIn">
          <button style={{ padding: '10px 20px', cursor: 'pointer' }} className='bg-red-600'>
            Sign In
          </button>
      </Link>

      <Link href="/signUp">
          <button style={{ padding: '10px 20px', cursor: 'pointer' }} className='bg-blue-600'>
            Sign Up
          </button>
      </Link>

    </div>
  )
}

export default page
